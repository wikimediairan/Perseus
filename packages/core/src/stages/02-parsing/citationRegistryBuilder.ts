import type {
  CitationDefinition,
  CitationId,
  CitationReference,
  CitationStyle,
} from "../../ir/citation";
import { CitationRegistry } from "../../ir/citation";

const REF_SELECTOR = '[typeof*="mw:Extension/ref"]';

interface ParsedRefAttrs {
  name: null | string;
  group: null | string;
  bodyHtml: null | string;
  dir: null | "ltr" | "rtl";
  malformed: boolean;
}

function readRefAttrs(el: Element): ParsedRefAttrs {
  const dataMw = (el as HTMLElement).dataset.mw;
  const dirAttr = el.getAttribute("dir");
  const dir = dirAttr === "ltr" || dirAttr === "rtl" ? dirAttr : null;

  if (!dataMw) {
    return { name: null, group: null, bodyHtml: null, dir, malformed: true };
  }

  try {
    const parsed = JSON.parse(dataMw) as {
      attrs?: { name?: string; group?: string };
      body?: { html?: string; id?: string };
    };
    return {
      name: typeof parsed.attrs?.name === "string" ? parsed.attrs.name : null,
      group:
        typeof parsed.attrs?.group === "string" ? parsed.attrs.group : null,
      bodyHtml: typeof parsed.body?.html === "string" ? parsed.body.html : null,
      dir,
      malformed: false,
    };
  } catch {
    return { name: null, group: null, bodyHtml: null, dir, malformed: true };
  }
}

function classifyStyle(
  bodyHtml: null | string,
  malformed: boolean,
): CitationStyle {
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
    const templateName = parsed.parts?.[0]?.template?.target?.wt
      ?.trim()
      .toLowerCase();
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
        message:
          "Could not parse a citation's data; preserving it as an unclassified definition.",
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
