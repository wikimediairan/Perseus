import type { SectionLocalizationConfig } from "../../config/targetWikis";
import {
  getTopLevelTemplateName,
  isOutermostTransclusion,
  normalizeTemplateName,
} from "../02-parsing/templateParameters";

const HEADING_LEVEL: Record<string, number> = {
  H1: 1,
  H2: 2,
  H3: 3,
  H4: 4,
  H5: 5,
  H6: 6,
};

type SectionKind = "notes" | "references";

function classifyHeadingText(text: string): SectionKind | null {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[:\s]+$/, "");

  if (normalized === "notes") return "notes";
  if (normalized === "references") return "references";
  return null;
}

interface DataMwTemplate {
  target?: { wt?: string; href?: string };
  params?: Record<string, { wt?: string }>;
}

interface DataMwShape {
  parts?: { template?: DataMwTemplate }[];
}

function readDataMw(el: Element): DataMwShape | null {
  const raw = (el as HTMLElement).dataset?.mw ?? el.getAttribute("data-mw");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DataMwShape;
  } catch {
    return null;
  }
}

function renameReflistTemplate(
  el: Element,
  newName: string,
  extraParams?: Record<string, string>,
): void {
  const dataMw = readDataMw(el);
  const template = dataMw?.parts?.[0]?.template;
  if (!template?.target) return;

  template.target.wt = newName;
  if (template.target.href) {
    template.target.href = `./Template:${newName}`;
  }

  if (extraParams) {
    template.params = { ...template.params };
    for (const [name, value] of Object.entries(extraParams)) {
      template.params[name] = { wt: value };
    }
  }

  el.setAttribute("data-mw", JSON.stringify(dataMw));
}

export function localizeReferenceSections(
  root: Element,
  config: SectionLocalizationConfig | null,
): number {
  if (!config) return 0;
  const localization = config;

  let localizedHeadings = 0;
  const stack: { level: number; kind: SectionKind | null }[] = [];

  function currentKind(): SectionKind | null {
    return stack.length > 0 ? stack[stack.length - 1].kind : null;
  }

  function visit(el: Element): void {
    const level = HEADING_LEVEL[el.tagName];

    if (level !== undefined) {
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }

      const kind = classifyHeadingText(el.textContent ?? "");
      if (kind) {
        el.textContent =
          kind === "notes"
            ? localization.notesHeading
            : localization.referencesHeading;
        localizedHeadings++;
      }

      stack.push({ level, kind });
    } else {
      const kind = currentKind();

      if (kind && isOutermostTransclusion(el)) {
        const name = getTopLevelTemplateName(el);
        if (name && normalizeTemplateName(name) === "reflist") {
          renameReflistTemplate(
            el,
            localization.reflistTemplateName,
            kind === "references"
              ? localization.referencesTemplateParams
              : undefined,
          );
        }
      }
    }

    for (const child of Array.from(el.children)) {
      visit(child as Element);
    }
  }

  for (const child of Array.from(root.children)) {
    visit(child as Element);
  }

  return localizedHeadings;
}
