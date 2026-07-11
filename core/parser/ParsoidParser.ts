/**
 * ParsoidParser
 *
 * Real implementation. Per the fixed architecture, Parsoid is the only
 * permitted Wikitext parser and no regex-based parsing is allowed. Since
 * self-hosting the Parsoid service is impractical for a lightweight
 * desktop app, this implementation uses the MediaWiki REST API's
 * stateless transform endpoint, which runs the *real* Parsoid service
 * server-side and returns its actual output — this is not a
 * reimplementation or approximation of Parsoid, it is Parsoid:
 *
 *   POST https://{domain}/api/rest_v1/transform/wikitext/to/html/{title}
 *
 * Split in two, deliberately:
 *
 *   fetchParsoidHtml()      — the network half: wikitext -> HTML.
 *   buildIRFromParsoidHtml() — the pure half: HTML -> IR. No network,
 *                              no knowledge of where the HTML came from.
 *
 * This split exists for the Translation Package Redesign: a package's
 * `snapshot.parsoidHtml` is fed directly into `buildIRFromParsoidHtml`
 * during import, reconstructing the exact same IR shape a live parse
 * would produce — without ever calling Wikipedia or Parsoid again. Live
 * parsing (`WikipediaParsoidParser.parse`) and snapshot reconstruction
 * (`Pipeline.reconstructFromSnapshot`) are two entry points into the
 * SAME builder, not two parsers — "shared reconstruction path."
 */

import { WIKIPEDIA_DOMAIN } from "@core/config/constants";
import { PerseusError } from "@core/errors/PerseusError";
import type { LoadedArticle } from "@core/input/InputLoader";
import type { TextNode, IntermediateRepresentation } from "@core/ir/IntermediateRepresentation";
import type { LinkNode } from "@core/ir/LinkNode";
import type { Logger } from "@core/logging/Logger";
import { buildCitationRegistry } from "@core/parser/citations";
import { flattenToPlaceholderText } from "@core/parser/placeholders";

export interface Parser {
  parse(article: LoadedArticle): Promise<IntermediateRepresentation>;
}

/** Block-level elements whose content is eligible for translation, provided they aren't inside a protected region. */
const TRANSLATABLE_BLOCK_SELECTOR =
  "p, li, dd, dt, th, td, h1, h2, h3, h4, h5, h6, blockquote, figcaption";

/**
 * True if `el` is a template transclusion, OR is a citation definition
 * or the rendered reference list itself (`typeof` starting with
 * `mw:Extension/ref` — this prefix also matches `mw:Extension/references`,
 * covering both in one check). Content in either category must never be
 * selected as an ordinary translatable block or link: citation
 * definitions are handled entirely through the CitationRegistry instead
 * (see parser/citations.ts).
 */
function isInsideProtectedRegion(el: Element): boolean {
  let node: null | Element = el;

  while (node) {
    const typeofAttr = node.getAttribute("typeof") || "";

    if (
      typeofAttr
        .split(/\s+/)
        .some((t) => t.startsWith("mw:Transclusion") || t.startsWith("mw:Extension/ref"))
    ) {
      return true;
    }

    node = node.parentElement;
  }

  return false;
}

/**
 * The network half: submits wikitext to the MediaWiki REST API and
 * returns the raw Parsoid HTML fragment string. This is the only part
 * of parsing that requires connectivity — and notably, it never requires
 * the ARTICLE to still exist or be unchanged, only that the Parsoid
 * service itself is reachable (it processes the wikitext given in the
 * POST body statelessly; `title` only provides template-expansion
 * context).
 */
export async function fetchParsoidHtml(rawWikitext: string, sourceTitle: string): Promise<string> {
  const title = encodeURIComponent(sourceTitle || "Untitled");
  const endpoint = `https://${WIKIPEDIA_DOMAIN}/api/rest_v1/transform/wikitext/to/html/${title}`;

  let response: Response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        wikitext: rawWikitext,
        body_only: "true",
      }).toString(),
    });
  } catch (error) {
    throw new PerseusError("ParsingError", "Could not reach the Parsoid parsing service.", {
      stage: "parse-with-parsoid",
      cause: error,
    });
  }

  if (!response.ok) {
    throw new PerseusError(
      "ParsingError",
      `Parsoid parsing failed (HTTP ${response.status}). The article may contain markup Parsoid could not process.`,
      { stage: "parse-with-parsoid", context: { status: response.status } },
    );
  }

  return response.text();
}

/**
 * The pure half: walks already-fetched (or already-stored, from a
 * Translation Package snapshot) Parsoid HTML and builds an IR from it.
 * No network access, no side effects beyond optional logging. Given the
 * exact same `html`, this always produces the exact same ids, links, and
 * text nodes — that determinism is what lets a Translation Package's
 * `translation[]` entries still line up correctly with a reconstructed
 * IR, regardless of how much time has passed or whether the live
 * Wikipedia article has since changed.
 */
export function buildIRFromParsoidHtml(
  html: string,
  sourceTitle: string,
  logger?: Logger,
): IntermediateRepresentation {
  // Local per call, not module-level — see the historical note in git blame /
  // the design proposal: ids must be a pure function of `html` alone.
  let linkIdCounter = 0;
  let textIdCounter = 0;

  const document = new DOMParser().parseFromString(
    `<div id="perseus-root">${html}</div>`,
    "text/html",
  );
  const root = document.getElementById("perseus-root");

  if (!root) {
    throw new PerseusError(
      "ParsingError",
      "Parsoid returned content that could not be parsed as HTML.",
      {
        stage: "parse-with-parsoid",
      },
    );
  }

  const links: LinkNode[] = [];
  const textNodes: TextNode[] = [];
  const nodeElements = new Map<string, Element>();
  const placeholdersMap = new Map<
    string,
    ReturnType<typeof flattenToPlaceholderText>["placeholders"]
  >();
  const linkElements = new Map<string, Element>();

  // Built first: the link/text walks below need it (flattenToPlaceholderText
  // identifies citation markers via the registry, not by re-deriving it).
  const citations = buildCitationRegistry(root);

  if (logger) {
    citations.flushWarningsTo(logger);
  }

  // Links: every internal wiki link Parsoid identified, anywhere in the document.
  for (const a of root.querySelectorAll('a[rel~="mw:WikiLink"]')) {
    if (isInsideProtectedRegion(a)) {
      continue;
    }

    const href = a.getAttribute("href") ?? "";
    const originalTarget = decodeURIComponent(href.replace(/^\.\//, ""));
    if (!originalTarget) {
      continue;
    }

    const id = `link-${++linkIdCounter}`;
    links.push({
      id,
      originalTarget,
      resolvedTarget: null,
      label: a.textContent ?? originalTarget,
    });
    linkElements.set(id, a);
  }

  // Text nodes: eligible block-level elements, skipping anything inside a
  // template or a citation definition/reference list (isInsideProtectedRegion).
  for (const block of root.querySelectorAll(TRANSLATABLE_BLOCK_SELECTOR)) {
    if (isInsideProtectedRegion(block)) {
      continue;
    }

    // Avoid double-extracting nested eligible blocks (e.g. <td><p>...) — only the innermost is a leaf.
    if (block.querySelector(TRANSLATABLE_BLOCK_SELECTOR)) {
      continue;
    }

    const { text, placeholders } = flattenToPlaceholderText(block, citations);
    if (!text) {
      continue;
    }

    const id = `text-${++textIdCounter}`;
    textNodes.push({ id, text });
    nodeElements.set(id, block);
    placeholdersMap.set(id, placeholders);
  }

  return {
    sourceTitle,
    links,
    textNodes,
    citations,
    structure: {
      document,
      nodeElements,
      placeholders: placeholdersMap,
      linkElements,
    },
  };
}

export class WikipediaParsoidParser implements Parser {
  constructor(private readonly logger?: Logger) {}

  async parse(article: LoadedArticle): Promise<IntermediateRepresentation> {
    const html = await fetchParsoidHtml(article.rawWikitext, article.sourceTitle);
    return buildIRFromParsoidHtml(html, article.sourceTitle, this.logger);
  }
}
