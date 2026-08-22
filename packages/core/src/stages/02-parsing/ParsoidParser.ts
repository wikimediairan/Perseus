import { WIKIMEDIA_USER_AGENT, WIKIPEDIA_DOMAIN } from "../../config/constants";
import type { CategoryNode } from "../../ir/CategoryNode";
import type {
  IntermediateRepresentation,
  TextNode,
} from "../../ir/IntermediateRepresentation";
import type { LinkNode } from "../../ir/LinkNode";
import type { TemplateLinkResolution } from "../../ir/wikitextLinkUtils";
import { stripFragment } from "../../ir/wikitextLinkUtils";
import { PerseusError } from "../../platform/errors/PerseusError";
import type { Logger } from "../../platform/logging/Logger";
import type { LoadedArticle } from "../01-input/InputLoader";
import { buildCitationRegistry } from "./citationRegistryBuilder";
import { flattenToPlaceholderText } from "./placeholders";
import { collectReferenceSectionElements } from "./referenceSections";
import { extractTemplateParameterUnits } from "./templateParameters";

export interface Parser {
  parse(article: LoadedArticle): Promise<IntermediateRepresentation>;
}

const TRANSLATABLE_BLOCK_SELECTOR =
  "p, li, dd, dt, th, td, h1, h2, h3, h4, h5, h6, blockquote, figcaption";

function isInsideProtectedRegion(el: Element): boolean {
  let node: null | Element = el;

  while (node) {
    const typeofAttr = node.getAttribute("typeof") || "";

    if (
      typeofAttr
        .split(/\s+/)
        .some(
          (t) =>
            t.startsWith("mw:Transclusion") || t.startsWith("mw:Extension/ref"),
        )
    ) {
      return true;
    }

    node = node.parentElement;
  }

  return false;
}

async function fetchParsoidHtml(
  rawWikitext: string,
  sourceTitle: string,
): Promise<string> {
  const title = encodeURIComponent(sourceTitle || "Untitled");
  const endpoint = `https://${WIKIPEDIA_DOMAIN}/api/rest_v1/transform/wikitext/to/html/${title}`;

  let response: Response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": WIKIMEDIA_USER_AGENT,
      },
      body: new URLSearchParams({
        wikitext: rawWikitext,
        body_only: "true",
      }).toString(),
    });
  } catch (error) {
    throw new PerseusError(
      "ParsingError",
      "Could not reach the Parsoid parsing service.",
      {
        stage: "parse-with-parsoid",
        cause: error,
        context: { retryable: true },
      },
    );
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

export async function fetchRevisionHtml(revisionId: number): Promise<string> {
  const endpoint = `https://${WIKIPEDIA_DOMAIN}/w/rest.php/v1/revision/${revisionId}/html`;

  let response: Response;

  try {
    response = await fetch(endpoint, {
      headers: { "User-Agent": WIKIMEDIA_USER_AGENT },
    });
  } catch (error) {
    throw new PerseusError(
      "ParsingError",
      "Could not reach Wikipedia to load the saved revision.",
      {
        stage: "parse-with-parsoid",
        cause: error,
        context: { retryable: true },
      },
    );
  }

  if (response.status === 404) {
    throw new PerseusError(
      "ParsingError",
      `Wikipedia revision ${revisionId} could not be found. It may have been deleted or oversighted.`,
      { stage: "parse-with-parsoid" },
    );
  }

  if (!response.ok) {
    const upstreamMessage = await response
      .text()
      .then((text) => text.slice(0, 300))
      .catch(() => undefined);

    throw new PerseusError(
      "ParsingError",
      `Failed to load revision ${revisionId} (HTTP ${response.status}).`,
      {
        stage: "parse-with-parsoid",
        context: {
          status: response.status,
          retryable: response.status === 429 || response.status >= 500,
          ...(upstreamMessage ? { upstreamMessage } : {}),
        },
      },
    );
  }

  const fullHtml = await response.text();
  const document = new DOMParser().parseFromString(fullHtml, "text/html");
  return document.body ? document.body.innerHTML : fullHtml;
}

export function buildIRFromParsoidHtml(
  html: string,
  sourceTitle: string,
  logger?: Logger,
): IntermediateRepresentation {
  let linkIdCounter = 0;
  let textIdCounter = 0;
  let categoryIdCounter = 0;

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
  const categories: CategoryNode[] = [];
  const textNodes: TextNode[] = [];
  const nodeElements = new Map<string, Element>();
  const placeholdersMap = new Map<
    string,
    ReturnType<typeof flattenToPlaceholderText>["placeholders"]
  >();
  const linkElements = new Map<string, Element>();
  const categoryElements = new Map<string, Element>();

  const citations = buildCitationRegistry(root);

  if (logger) {
    citations.flushWarningsTo(logger);
  }

  const referenceSectionElements = collectReferenceSectionElements(root);

  for (const a of root.querySelectorAll('a[rel~="mw:WikiLink"]')) {
    if (isInsideProtectedRegion(a) || referenceSectionElements.has(a)) {
      continue;
    }

    const href = a.getAttribute("href") ?? "";
    const decodedHref = decodeURIComponent(href.replace(/^\.\//, ""));

    const { title: originalTarget, fragment } = stripFragment(decodedHref);
    if (!originalTarget) {
      continue;
    }

    const id = `link-${++linkIdCounter}`;
    links.push({
      id,
      originalTarget,
      fragment,
      resolvedTarget: null,
      label: a.textContent ?? originalTarget,
    });
    linkElements.set(id, a);
  }

  for (const link of root.querySelectorAll(
    'link[rel~="mw:PageProp/Category"]',
  )) {
    if (isInsideProtectedRegion(link) || referenceSectionElements.has(link)) {
      continue;
    }

    const href = link.getAttribute("href") ?? "";
    const { title: target } = stripFragment(
      decodeURIComponent(href.replace(/^\.\//, "")),
    );
    const withoutNamespace = target
      .replace(/^Category:/i, "")
      .replaceAll("_", " ")
      .trim();

    if (!withoutNamespace) {
      continue;
    }

    const id = `category-${++categoryIdCounter}`;
    categories.push({
      id,
      originalTarget: withoutNamespace,
      resolvedTarget: null,
    });
    categoryElements.set(id, link);
  }

  for (const block of root.querySelectorAll(TRANSLATABLE_BLOCK_SELECTOR)) {
    if (isInsideProtectedRegion(block) || referenceSectionElements.has(block)) {
      continue;
    }

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

  const templateLinkResolutions = new Map<string, TemplateLinkResolution>();

  const templateExtraction = extractTemplateParameterUnits(
    root,
    textIdCounter,
    referenceSectionElements,
    templateLinkResolutions,
  );
  textIdCounter = templateExtraction.nextTextIdCounter;
  for (const node of templateExtraction.result.textNodes) {
    textNodes.push(node);
  }
  for (const [id, element] of templateExtraction.result.nodeElements) {
    nodeElements.set(id, element);
  }

  return {
    sourceTitle,
    links,
    categories,
    textNodes,
    citations,
    structure: {
      document,
      nodeElements,
      placeholders: placeholdersMap,
      linkElements,
      categoryElements,
      templateParamWriters: templateExtraction.result.templateParamWriters,

      templateLinkTargets: templateExtraction.result.linkTargets,
      templateLinkResolutions,
    },
  };
}

export class WikipediaParsoidParser implements Parser {
  constructor(private readonly logger?: Logger) {}

  async parse(article: LoadedArticle): Promise<IntermediateRepresentation> {
    const html = await fetchParsoidHtml(
      article.rawWikitext,
      article.sourceTitle,
    );
    return buildIRFromParsoidHtml(html, article.sourceTitle, this.logger);
  }
}
