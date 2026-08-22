const REFERENCE_SECTION_NAMES = new Set([
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
  "sources and notes",
]);

function normalizeHeadingText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[:\s]+$/, "");
}

export function isReferenceSectionHeadingText(text: string): boolean {
  return REFERENCE_SECTION_NAMES.has(normalizeHeadingText(text));
}

const HEADING_LEVEL: Record<string, number> = {
  H1: 1,
  H2: 2,
  H3: 3,
  H4: 4,
  H5: 5,
  H6: 6,
};

export function collectReferenceSectionElements(root: Element): Set<Element> {
  const excluded = new Set<Element>();
  const stack: { level: number; excluded: boolean }[] = [];

  function visit(el: Element): void {
    const level = HEADING_LEVEL[el.tagName];

    if (level !== undefined) {
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }

      const inheritedExcluded =
        stack.length > 0 && stack[stack.length - 1].excluded;
      const selfExcluded = isReferenceSectionHeadingText(el.textContent ?? "");
      const isExcluded = inheritedExcluded || selfExcluded;

      stack.push({ level, excluded: isExcluded });

      if (isExcluded) {
        excluded.add(el);
      }
    } else if (stack.length > 0 && stack[stack.length - 1].excluded) {
      excluded.add(el);
    }

    for (const child of Array.from(el.children)) {
      visit(child as Element);
    }
  }

  for (const child of Array.from(root.children)) {
    visit(child as Element);
  }

  return excluded;
}
