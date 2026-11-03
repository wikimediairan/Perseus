import { DOMParser } from "linkedom";
import type { SectionNode, SectionSelection } from "../domain/types.js";
import { ApiError } from "../util/errors.js";

const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6";
const REF_SELECTOR = '[typeof*="mw:Extension/ref"]';

const REFERENCE_HEADINGS = new Set(
  [
    "references",
    "reference",
    "notes",
    "footnotes",
    "sources",
    "source",
    "bibliography",
    "citations",
    "citation",
    "works cited",
    "cited works",
    "notes and references",
    "references and notes",
    "منابع",
    "منبع",
    "پانویس",
    "پانویس‌ها",
    "یادداشت",
    "یادداشت‌ها",
    "یادکرد",
    "یادکردها",
    "کتاب‌شناسی",
    "ارجاع",
    "ارجاعات",
    "сарчашмаҳо",
    "сарчашма",
    "эзоҳҳо",
    "эзоҳ",
    "китобшиносӣ",
  ].map((name) => name.trim().toLowerCase()),
);

export interface SectionBuildResult {
  tree: SectionNode[];
  flat: SectionNode[];
  hasOwnText: Record<string, boolean>;
  blocksBySection: Map<string | null, Element[]>;
  headingIds: Map<Element, string>;
}

export interface SelectedHtml {
  html: string;
  root: Element;
  document: Document;
  tree: SectionNode[];
  warnings: string[];
  needsReferencesList: boolean;
}

function isHeading(element: Element): boolean {
  return /^H[1-6]$/.test(element.tagName);
}

function normalizeHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[:：\s]+$/, "");
}

function isReferenceHeading(text: string): boolean {
  return REFERENCE_HEADINGS.has(normalizeHeading(text));
}

function hasMeaningfulContent(element: Element): boolean {
  const text = (element.textContent ?? "").trim();
  if (/\p{L}/u.test(text)) return true;
  return Boolean(
    element.matches(
      'table, figure, img, [typeof*="mw:Transclusion"], [typeof*="mw:Extension/references"]',
    ),
  );
}

export function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(
    `<div id="perseus-root">${html}</div>`,
    "text/html",
  ) as unknown as Document;
}

export function buildSections(html: string): SectionBuildResult {
  const document = parseHtml(html);
  const root = document.getElementById("perseus-root");
  if (!root) {
    throw new ApiError(
      502,
      "SOURCE_HTML_INVALID",
      "The source HTML could not be parsed.",
    );
  }
  return buildSectionsFromRoot(root);
}

function buildSectionsFromRoot(root: Element): SectionBuildResult {
  const headingElements = [...root.querySelectorAll(HEADING_SELECTOR)];
  const nodesByElement = new Map<Element, SectionNode>();
  const headingIds = new Map<Element, string>();
  const flat: SectionNode[] = [];
  const roots: SectionNode[] = [];
  const stack: SectionNode[] = [];

  headingElements.forEach((element, index) => {
    const level = Number(element.tagName.slice(1));
    const node: SectionNode = {
      id: `sec-${index + 1}`,
      title: (element.textContent ?? "").trim(),
      level,
      parentId: null,
      hasOwnText: false,
      children: [],
    };

    for (;;) {
      const top = stack[stack.length - 1];
      if (!top || top.level < level) break;
      stack.pop();
    }

    const parent = stack[stack.length - 1] ?? null;
    if (parent) {
      node.parentId = parent.id;
      parent.children.push(node);
    } else {
      roots.push(node);
    }

    stack.push(node);
    nodesByElement.set(element, node);
    headingIds.set(element, node.id);
    flat.push(node);
  });

  const blocksBySection = new Map<string | null, Element[]>();

  const addBlock = (sectionId: string | null, element: Element): void => {
    const list = blocksBySection.get(sectionId) ?? [];
    list.push(element);
    blocksBySection.set(sectionId, list);
  };

  let currentSection: string | null = null;

  const visit = (parent: Element): void => {
    for (const child of Array.from(parent.children)) {
      if (isHeading(child)) {
        const node = nodesByElement.get(child);
        currentSection = node?.id ?? currentSection;
        continue;
      }

      if (child.querySelector(HEADING_SELECTOR)) {
        const previous = currentSection;
        visit(child);
        currentSection = previous;
        continue;
      }

      addBlock(currentSection, child);
    }
  };

  visit(root);

  const hasOwnText: Record<string, boolean> = {};
  for (const node of flat) {
    const blocks = blocksBySection.get(node.id) ?? [];
    hasOwnText[node.id] = blocks.some(hasMeaningfulContent);
    node.hasOwnText = hasOwnText[node.id] ?? false;
  }

  return { tree: roots, flat, hasOwnText, blocksBySection, headingIds };
}

function parseDataMw(element: Element): {
  attrs?: { name?: string; group?: string };
  body?: { html?: string };
} | null {
  const raw =
    (element as HTMLElement).dataset?.mw ?? element.getAttribute("data-mw");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as {
      attrs?: { name?: string; group?: string };
      body?: { html?: string };
    };
  } catch {
    return null;
  }
}

function refName(element: Element): string | null {
  const data = parseDataMw(element);
  return typeof data?.attrs?.name === "string" ? data.attrs.name : null;
}

function isDefiningRef(element: Element): boolean {
  const data = parseDataMw(element);
  return typeof data?.body?.html === "string";
}

function referenceSectionIds(result: SectionBuildResult): Set<string> {
  return new Set(
    result.flat
      .filter((section) => isReferenceHeading(section.title))
      .map((section) => section.id),
  );
}

export function selectSections(
  html: string,
  selection: SectionSelection,
): SelectedHtml {
  const document = parseHtml(html);
  const root = document.getElementById("perseus-root");
  if (!root) {
    throw new ApiError(
      502,
      "SOURCE_HTML_INVALID",
      "The source HTML could not be parsed.",
    );
  }

  const built = buildSectionsFromRoot(root);
  const byId = new Map(built.flat.map((section) => [section.id, section]));

  for (const id of Object.keys(selection.sections)) {
    if (!byId.has(id)) {
      throw new ApiError(
        409,
        "SELECTION_MISMATCH",
        "The article structure changed. Reload the page and select the sections again.",
      );
    }
  }

  const selected: Record<string, boolean> = {};
  const ownText: Record<string, boolean> = {};

  for (const section of built.flat) {
    selected[section.id] = selection.sections[section.id]?.selected ?? true;
    ownText[section.id] = selection.sections[section.id]?.ownText ?? true;
  }

  const descendantSelected = new Map<string, boolean>();
  for (const section of [...built.flat].reverse()) {
    descendantSelected.set(
      section.id,
      section.children.some(
        (child) =>
          selected[child.id] === true ||
          descendantSelected.get(child.id) === true,
      ),
    );
  }

  const keepHeading = (id: string): boolean =>
    selected[id] === true || descendantSelected.get(id) === true;

  const keptBlocks = new Set<Element>();
  const leadBlocks = built.blocksBySection.get(null) ?? [];
  if (selection.lead) {
    for (const block of leadBlocks) keptBlocks.add(block);
  }

  for (const section of built.flat) {
    if (selected[section.id] && ownText[section.id]) {
      for (const block of built.blocksBySection.get(section.id) ?? []) {
        keptBlocks.add(block);
      }
    }
  }

  const warnings: string[] = [];
  const keptRefNames = new Set<string>();

  for (const block of keptBlocks) {
    for (const ref of block.querySelectorAll(REF_SELECTOR)) {
      const name = refName(ref);
      if (name) keptRefNames.add(name);
    }
  }

  let needsReferenceDefinitions = false;
  const definitionBlocks = new Set<Element>();
  const assignedBlocks = [...built.blocksBySection.values()].flat();

  for (const ref of Array.from(root.querySelectorAll(REF_SELECTOR))) {
    if (!isDefiningRef(ref)) continue;
    const name = refName(ref);
    if (!name || !keptRefNames.has(name)) continue;

    let insideKeptBlock = false;
    let cursor: Element | null = ref;
    while (cursor) {
      if (keptBlocks.has(cursor)) {
        insideKeptBlock = true;
        break;
      }
      cursor = cursor.parentElement;
    }
    if (insideKeptBlock) continue;

    const owner = assignedBlocks.find(
      (block) => block === ref || block.contains(ref),
    );
    definitionBlocks.add(owner ?? ref);
    needsReferenceDefinitions = true;
  }

  if (needsReferenceDefinitions) {
    const refSectionIds = referenceSectionIds(built);
    let retainedReferenceSection = false;

    for (const sectionId of refSectionIds) {
      for (const block of built.blocksBySection.get(sectionId) ?? []) {
        keptBlocks.add(block);
        retainedReferenceSection = true;
      }
    }

    for (const block of definitionBlocks) keptBlocks.add(block);

    warnings.push(
      retainedReferenceSection
        ? "بخش منابع برای حفظ ارجاع‌های بخش‌های انتخاب‌شده در خروجی نگه داشته شد."
        : "تعریف برخی ارجاع‌های بخش‌های انتخاب‌شده در بخش‌های حذف‌شده بود و برای جلوگیری از ارجاع بی‌تعریف نگه داشته شد.",
    );
  }

  for (const [sectionId, blocks] of built.blocksBySection) {
    if (sectionId !== null) {
      for (const block of blocks) {
        if (!keptBlocks.has(block)) block.remove();
      }
    }
  }

  for (const block of leadBlocks) {
    if (!keptBlocks.has(block)) block.remove();
  }

  for (const heading of Array.from(root.querySelectorAll(HEADING_SELECTOR))) {
    const id = built.headingIds.get(heading);
    if (id && !keepHeading(id)) heading.remove();
  }

  // Remove section wrappers that became empty after pruning.
  for (const section of Array.from(root.querySelectorAll("section"))) {
    if (
      (section.textContent ?? "").trim() === "" &&
      section.querySelector(
        'img, table, figure, [typeof*="mw:Extension/references"], [typeof*="mw:Transclusion"]',
      ) === null
    ) {
      section.remove();
    }
  }

  let keptReferenceSection = false;
  for (const section of built.flat) {
    if (!isReferenceHeading(section.title)) continue;
    for (const block of built.blocksBySection.get(section.id) ?? []) {
      if (keptBlocks.has(block)) {
        keptReferenceSection = true;
        break;
      }
    }
    if (keptReferenceSection) break;
  }

  const htmlAfter = (root.innerHTML ?? "").trim();
  if (!htmlAfter) {
    throw new ApiError(
      422,
      "EMPTY_SELECTION",
      "No content is selected. Select at least one section or the lead.",
    );
  }

  return {
    html: htmlAfter,
    root,
    document,
    tree: built.tree,
    warnings,
    needsReferencesList: keptRefNames.size > 0 && !keptReferenceSection,
  };
}
