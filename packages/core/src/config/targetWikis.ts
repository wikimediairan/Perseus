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
}

export const TARGET_WIKIS: Record<TargetWikiCode, TargetWikiDefinition> = {
  fa: {
    code: "fa",
    displayName: "Persian Wikipedia",
    languageName: "Persian",
    domain: "fa.wikipedia.org",
    create: "ویکی‌پدیا:ایجاد_مقاله",
    draft: "ویکی‌پدیا:پیش‌نویس‌ها",
    move: "ویکی‌پدیا:درخواست_انتقال?action=edit&section=new&preload=ویکی‌پدیا:درخواست_انتقال/پیش‌بارگذاری",
    direction: "rtl",
    templateRemovalDenylist: COMMON_TEMPLATE_REMOVAL_DENYLIST,
    interwikiFallbackTemplate: "پم",
    translationDisclosureTemplate: "{{ترجمه با کمک مدل‌های بزرگ زبانی}}",
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
  },
};

export const DEFAULT_TARGET_WIKI: TargetWikiCode = "fa";

export function isTargetWikiCode(value: unknown): value is TargetWikiCode {
  return typeof value === "string" && value in TARGET_WIKIS;
}

export function getTargetWiki(code: TargetWikiCode): TargetWikiDefinition {
  return TARGET_WIKIS[code];
}
