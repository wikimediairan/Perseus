import type { TargetWikiDefinition } from "../../config/targetWikis";
import type { IntermediateRepresentation } from "../../ir/IntermediateRepresentation";
import {
  buildInterwikiTemplateDataMw,
  normalizeTitle,
} from "../../ir/wikitextLinkUtils";

function createAboutIdMinter(): () => string {
  let counter = 0;
  return () => `#mwt${++counter}`;
}

function buildInterwikiTemplateElement(
  ownerDocument: Document,
  aboutId: string,
  templateName: string,
  label: string,
  target: string,
): Element {
  const span = ownerDocument.createElement("span");
  span.setAttribute("typeof", "mw:Transclusion");
  span.setAttribute("about", aboutId);
  span.setAttribute(
    "data-mw",
    JSON.stringify(buildInterwikiTemplateDataMw(templateName, label, target)),
  );

  return span;
}

export function applyInterwikiFallbackLinks(
  root: Element,
  ir: IntermediateRepresentation,
  targetWiki: TargetWikiDefinition,
): number {
  const templateName = targetWiki.interwikiFallbackTemplate;
  if (!templateName) {
    return 0;
  }

  const resolutionByOriginalTitle = new Map<string, string | null>();
  for (const link of ir.links) {
    resolutionByOriginalTitle.set(
      normalizeTitle(link.originalTarget),
      link.resolvedTarget,
    );
  }

  const nextAboutId = createAboutIdMinter();
  let rewritten = 0;

  for (const anchor of [...root.querySelectorAll('a[rel~="mw:WikiLink"]')]) {
    const href = anchor.getAttribute("href") ?? "";
    const decoded = decodeURIComponent(href.replace(/^\.\//, ""));

    const withoutFragment = decoded.split("#")[0];
    const normalized = normalizeTitle(withoutFragment);

    if (!resolutionByOriginalTitle.has(normalized)) {
      continue;
    }

    if (resolutionByOriginalTitle.get(normalized)) {
      continue;
    }

    const label = anchor.textContent ?? withoutFragment;
    const ownerDocument = anchor.ownerDocument;
    const templateElement = buildInterwikiTemplateElement(
      ownerDocument,
      nextAboutId(),
      templateName,
      label,
      withoutFragment,
    );
    anchor.replaceWith(templateElement);
    rewritten++;
  }

  return rewritten;
}
