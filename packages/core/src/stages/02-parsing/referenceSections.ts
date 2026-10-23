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

const LOCALIZED_REFERENCE_SECTION_NAMES: Record<string, readonly string[]> = {
  ar: ["المراجع", "مراجع", "المصادر", "ملاحظات", "هوامش", "قائمة المصادر"],
  cs: ["reference", "poznámky", "literatura", "zdroje"],
  de: [
    "einzelnachweise",
    "belege",
    "quellen",
    "anmerkungen",
    "literatur",
    "bibliografie",
    "bibliographie",
    "fußnoten",
    "referenzen",
  ],
  es: ["referencias", "notas", "bibliografía", "fuentes", "citas"],
  fa: [
    "منابع",
    "منبع",
    "پانویس",
    "پانویس‌ها",
    "یادداشت",
    "یادداشت‌ها",
    "یادکرد",
    "یادکردها",
    "کتاب‌شناسی",
    "کتابشناسی",
    "ارجاع",
    "ارجاعات",
    "منابع و پانویس",
    "پانویس‌ها و منابع",
  ],
  fr: [
    "références",
    "notes",
    "notes et références",
    "bibliographie",
    "sources",
    "citations",
  ],
  he: ["הערות שוליים", "הערות", "מקורות", "ביבליוגרפיה"],
  hi: ["सन्दर्भ", "टिप्पणियाँ", "स्रोत", "ग्रन्थसूची"],
  id: ["referensi", "catatan", "sumber", "daftar pustaka"],
  it: ["note", "riferimenti", "bibliografia", "fonti", "citazioni"],
  ja: ["脚注", "注釈", "参考文献", "出典"],
  ko: ["각주", "참고 문헌", "출처", "주석"],
  nl: ["referenties", "noten", "bronnen", "bibliografie"],
  pl: ["przypisy", "bibliografia", "źródła", "uwagi"],
  pt: ["referências", "notas", "bibliografia", "fontes", "citações"],
  ru: [
    "примечания",
    "ссылки",
    "литература",
    "источники",
    "библиография",
    "сноски",
  ],
  sv: ["referenser", "noter", "källor", "bibliografi"],
  tg: [
    "манбаъҳо",
    "манбаъ",
    "эзоҳҳо",
    "эзоҳ",
    "сарчашмаҳо",
    "сарчашма",
    "китобшиносӣ",
  ],
  tr: ["kaynakça", "notlar", "referanslar", "kaynaklar", "bibliyografya"],
  uk: ["примітки", "джерела", "література", "бібліографія", "посилання"],
  zh: ["参考文献", "注释", "參考文獻", "註釋", "来源", "資料來源"],
};

function normalizeHeadingText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[:：\s]+$/, "");
}

function referenceSectionNamesFor(languageCode?: string): Set<string> {
  const names = new Set(REFERENCE_SECTION_NAMES);
  const baseLanguageCode = languageCode?.toLowerCase().split("-")[0];

  if (baseLanguageCode) {
    for (const name of LOCALIZED_REFERENCE_SECTION_NAMES[baseLanguageCode] ??
      []) {
      names.add(normalizeHeadingText(name));
    }
  }

  return names;
}

export function isReferenceSectionHeadingText(
  text: string,
  languageCode?: string,
): boolean {
  return referenceSectionNamesFor(languageCode).has(normalizeHeadingText(text));
}

const HEADING_LEVEL: Record<string, number> = {
  H1: 1,
  H2: 2,
  H3: 3,
  H4: 4,
  H5: 5,
  H6: 6,
};

export function collectReferenceSectionElements(
  root: Element,
  languageCode?: string,
): Set<Element> {
  const referenceSectionNames = referenceSectionNamesFor(languageCode);
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
      const selfExcluded = referenceSectionNames.has(
        normalizeHeadingText(el.textContent ?? ""),
      );
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
