/**
 * buildCitationRegistry
 *
 * Populates a CitationRegistry during IR construction. This module ONLY
 * reads the parsed DOM and records what it finds — it does not change
 * what ParsoidParser selects as translatable content, and nothing
 * downstream (Extraction, Merge, Wikitext Generation) consumes this
 * registry yet.
 *
 * Every definition and reference gets an HTML snapshot
 * (`element.outerHTML`) captured right here, once, at build time. That
 * snapshot — not a later live read of `element` — is what the registry
 * treats as authoritative from this point on (CitationRegistry is the
 * single source of truth for a citation's HTML; see
 * getReferenceHtml/getDefinitionHtml). Capturing it now, while we know
 * the DOM is pristine (nothing has run yet that could have touched it),
 * is what makes that guarantee meaningful.
 *
 * MediaWiki's Cite extension is represented by Parsoid as elements typed
 * `mw:Extension/ref` (one per `<ref>...</ref>` or `<ref name="x"/>`
 * occurrence) and `mw:Extension/references` (the rendered reference
 * list / `{{reflist}}`). The citation's real payload lives in that
 * element's `data-mw` attribute; nothing here parses or interprets that
 * payload beyond reading `name`/`group` and detecting whether the
 * occurrence carries a body (a "defining" occurrence) or not (a bare
 * reuse) — that's the minimum needed to track definitions, references,
 * named references, and repeats.
 *
 * Two passes, specifically to avoid document-order dependency: a bare
 * reuse can in principle appear before its defining occurrence in
 * Parsoid's output, and resolving in a single pass would make
 * "missing definition" warnings depend on DOM order rather than on
 * actual correctness.
 */

import type {
  CitationDefinition,
  CitationId,
  CitationReference,
  CitationStyle,
} from "@core/ir/citation";
import { CitationRegistry } from "@core/ir/citation";

const REF_SELECTOR = '[typeof*="mw:Extension/ref"]';

interface ParsedRefAttrs {
  name: null | string;
  group: null | string;
  bodyHtml: null | string;
  dir: null | "ltr" | "rtl";
  malformed: boolean;
}

/** Reads what we need from a ref element's data-mw, tolerating malformed/missing JSON rather than throwing. */
function readRefAttrs(el: Element): ParsedRefAttrs {
  const dataMw = (el as HTMLElement).dataset.mw;
  const dirAttr = el.getAttribute("dir");
  const dir = dirAttr === "ltr" || dirAttr === "rtl" ? dirAttr : null;

  if (!dataMw) {
    // No data-mw at all is unusual but not fatal — still track the occurrence, just without name/group/body info.
    return { name: null, group: null, bodyHtml: null, dir, malformed: true };
  }

  try {
    const parsed = JSON.parse(dataMw) as {
      attrs?: { name?: string; group?: string };
      body?: { html?: string; id?: string };
    };
    return {
      name: typeof parsed.attrs?.name === "string" ? parsed.attrs.name : null,
      group: typeof parsed.attrs?.group === "string" ? parsed.attrs.group : null,
      bodyHtml: typeof parsed.body?.html === "string" ? parsed.body.html : null,
      dir,
      malformed: false,
    };
  } catch {
    return { name: null, group: null, bodyHtml: null, dir, malformed: true };
  }
}

/**
 * Best-effort, informational-only style classification. Never drives any
 * behavior. The citation's actual content lives in `data-mw.body.html`
 * (a separate HTML string), NOT as live child DOM of the call-site
 * element (which typically only contains the rendered footnote number,
 * e.g. "[1]") — so this parses that string on its own rather than
 * inspecting the element's children.
 */
function classifyStyle(bodyHtml: null | string, malformed: boolean): CitationStyle {
  if (malformed || !bodyHtml) {
    return "unknown";
  }

  const fragment = new DOMParser().parseFromString(
    `<div id="perseus-ref-body">${bodyHtml}</div>`,
    "text/html",
  );
  const container = fragment.getElementById("perseus-ref-body");
  const transclusion = container?.querySelector('[typeof~="mw:Transclusion"]');

  if (!transclusion) {
    return container?.textContent?.trim() ? "plain-text" : "unknown";
  }

  const dataMw = (transclusion as HTMLElement).dataset.mw;
  if (!dataMw) {
    return "unknown";
  }

  try {
    const parsed = JSON.parse(dataMw) as {
      parts?: { template?: { target?: { wt?: string } } }[];
    };
    const templateName = parsed.parts?.[0]?.template?.target?.wt?.trim().toLowerCase();
    if (!templateName) {
      return "unknown";
    }

    if (templateName.startsWith("cite ")) {
      return "cite-template";
    }

    if (templateName === "sfn" || templateName.startsWith("sfn")) {
      return "sfn";
    }

    if (templateName.startsWith("harv")) {
      return "harv";
    }

    return "unknown";
  } catch {
    return "unknown";
  }
}

export function buildCitationRegistry(root: Element): CitationRegistry {
  const registry = new CitationRegistry();

  let citationIdCounter = 0;
  const nextId = (): CitationId => `cite-${++citationIdCounter}`;

  const refElements = [...root.querySelectorAll(REF_SELECTOR)];

  // Pass 1 — definitions: every occurrence that carries a body (defining occurrence).
  // Also register each defining occurrence as its own reference (a defining <ref> is also a call site).
  // A duplicate name (a second body under the same name) is NOT inserted as a second definition —
  // registerDefinition returns the FIRST definition's id instead, and this occurrence's reference
  // points at that canonical id, so the article's own authoring mistake doesn't produce a dangling node.
  const definingElements = new Set<Element>();

  for (const el of refElements) {
    const attrs = readRefAttrs(el);
    if (attrs.bodyHtml === null) {
      continue;
    }

    definingElements.add(el);
    const id = nextId();

    if (attrs.malformed) {
      registry.warnings.push({
        kind: "malformed-reference",
        message: "Could not parse a citation's data; preserving it as an unclassified definition.",
        citationId: id,
        name: attrs.name,
      });
    }

    const def: CitationDefinition = {
      id,
      name: attrs.name,
      group: attrs.group,
      style: classifyStyle(attrs.bodyHtml, attrs.malformed),
      dir: attrs.dir,
      element: el,
      snapshotHtml: el.outerHTML,
      referencedBy: [],
      translatableParameters: [],
    };
    const canonicalId = registry.registerDefinition(def);

    const ref: CitationReference = {
      id,
      name: attrs.name,
      group: attrs.group,
      isDefining: true,
      definitionId: canonicalId,
      element: el,
      snapshotHtml: el.outerHTML,
    };
    registry.registerReference(ref);
  }

  // Pass 2 — reuses: every occurrence without a body (bare <ref name="x"/> repeats).
  for (const el of refElements) {
    if (definingElements.has(el)) {
      continue;
    }

    const attrs = readRefAttrs(el);
    const id = nextId();

    if (attrs.malformed) {
      registry.warnings.push({
        kind: "malformed-reference",
        message:
          "Could not parse a citation reference's data; preserving it as an unresolved reference.",
        citationId: id,
        name: attrs.name,
      });
    }

    const ref: CitationReference = {
      id,
      name: attrs.name,
      group: attrs.group,
      isDefining: false,
      definitionId: null, // resolved by registerReference, by name, against Pass 1's definitions
      element: el,
      snapshotHtml: el.outerHTML,
    };
    registry.registerReference(ref);
  }

  registry.finalize();
  return registry;
}
