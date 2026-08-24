export type TargetWikiCode = "fa" | "tj";

const COMMON_TEMPLATE_REMOVAL_DENYLIST = [
  "Use mdy dates",
  "Use dmy dates",
  "Use American English",
  "Use British English",
  "Use Indian English",
  "Use Australian English",
  "EngvarB",
  "Use list-defined references",
  "Redirect",
];

export interface SectionLocalizationConfig {
  /** Localized `== Notes ==` heading text. */
  notesHeading: string;
  /** Localized `== References ==` heading text. */
  referencesHeading: string;
  /** Localized name for a `{{reflist}}`-family template found in a Notes/References section. */
  reflistTemplateName: string;
  /** Extra named parameters merged onto the reflist template specifically within a References section. */
  referencesTemplateParams: Record<string, string>;
}

export interface TargetWikiDefinition {
  code: TargetWikiCode;
  displayName: string;
  languageName: string;
  domain: string;
  create: string;
  draft: string;
  move: string;
  direction: "ltr" | "rtl";
  templateRemovalDenylist: string[];
  translationDisclosureTemplate: string | null;
  interwikiFallbackTemplate: string | null;
  /**
   * Localized strings for the Notes/References sections. `null` means this
   * target wiki has no confirmed localization yet — the section is left
   * exactly as authored in English, the pre-existing behavior. Mirrors the
   * `interwikiFallbackTemplate: null` convention above.
   */
  sectionLocalization: SectionLocalizationConfig | null;
}

export const TARGET_WIKIS: Record<TargetWikiCode, TargetWikiDefinition> = {
  fa: {
    code: "fa",
    displayName: "Persian Wikipedia",
    languageName: "Persian",
    domain: "fa.wikipedia.org",
    create: "ویکی‌پدیا:ایجاد_مقاله",
    draft: "ویکی‌پدیا:پیش‌نویس‌ها",
    move: "ویکی‌پدیا:درخواست_تغییرنام",
    direction: "rtl",
    templateRemovalDenylist: COMMON_TEMPLATE_REMOVAL_DENYLIST,
    interwikiFallbackTemplate: "پم",
    translationDisclosureTemplate: "{{ترجمه با کمک مدل‌های بزرگ زبانی}}",
    sectionLocalization: {
      notesHeading: "پانویس",
      referencesHeading: "منابع",
      reflistTemplateName: "پانویس",
      referencesTemplateParams: { چپ‌چین: "بله" },
    },
  },
  tj: {
    code: "tj",
    displayName: "Tajik Wikipedia",
    languageName: "Tajik",
    domain: "tj.wikipedia.org",
    create: "Википедиа:Эҷоди_мақола",
    draft: "",
    move: "Википедиа:Дархости_интиқол",
    direction: "ltr",
    templateRemovalDenylist: COMMON_TEMPLATE_REMOVAL_DENYLIST,
    interwikiFallbackTemplate: null,
    translationDisclosureTemplate: null,
    // No verified Tajik equivalents for these strings have been confirmed
    // yet; adding them later is just populating this field (see
    // SectionLocalizationConfig).
    sectionLocalization: null,
  },
};

export const DEFAULT_TARGET_WIKI: TargetWikiCode = "fa";

export function isTargetWikiCode(value: unknown): value is TargetWikiCode {
  return typeof value === "string" && value in TARGET_WIKIS;
}

export function getTargetWiki(code: TargetWikiCode): TargetWikiDefinition {
  return TARGET_WIKIS[code];
}
