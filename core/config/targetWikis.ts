export type TargetWikiCode = "fa" | "tj";

export interface TargetWikiDefinition {
  code: TargetWikiCode;
  displayName: string;
  languageName: string;
  domain: string;
  draft: string;
  move: string;
  direction: "ltr" | "rtl";
}

export const TARGET_WIKIS: Record<TargetWikiCode, TargetWikiDefinition> = {
  fa: {
    code: "fa",
    displayName: "Persian Wikipedia",
    languageName: "Persian",
    domain: "fa.wikipedia.org",
    draft: "ویکی‌پدیا:پیش‌نویس‌ها",
    move: "ویکی‌پدیا:درخواست_انتقال?action=edit&section=new&preload=ویکی‌پدیا:درخواست_انتقال/پیش‌بارگذاری",
    direction: "rtl",
  },
  tj: {
    code: "tj",
    displayName: "Tajik Wikipedia",
    languageName: "Tajik",
    domain: "tj.wikipedia.org",
    draft: "",
    move: "Википедиа:Дархости_интиқол",
    direction: "ltr",
  },
};

export const DEFAULT_TARGET_WIKI: TargetWikiCode = "fa";

export function isTargetWikiCode(value: unknown): value is TargetWikiCode {
  return typeof value === "string" && value in TARGET_WIKIS;
}

export function getTargetWiki(code: TargetWikiCode): TargetWikiDefinition {
  return TARGET_WIKIS[code];
}
