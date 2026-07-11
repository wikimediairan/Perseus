/**
 * targetWikis
 *
 * Registry of supported "Target Wikis" — the wiki a translation is
 * produced FOR (as opposed to the fixed English Wikipedia source, see
 * config/constants.ts). Replaces the old, hardcoded `TARGET_LANGUAGE`
 * constant that assumed Persian everywhere.
 *
 * This is the single place a future target wiki gets added. Everything
 * downstream (Wikidata sitelink lookups, the LLM system prompt, output
 * text direction) reads from a `TargetWikiDefinition` looked up here
 * rather than assuming Persian or hardcoding a language name/domain.
 */

export type TargetWikiCode = "fa" | "tj";

export interface TargetWikiDefinition {
  /** Matches the Wikidata sitelink prefix (`${code}wiki`) and the wiki's own language code. */
  code: TargetWikiCode;
  /** English-language display name, used as a fallback/internal label (the UI's own language switcher is a separate, unrelated concern — see src/i18n). */
  displayName: string;
  /** Language name as used inside the LLM system prompt (e.g. "...into formal, encyclopaedic Persian for fa.wikipedia.org"). */
  languageName: string;
  /** The target wiki's domain, mentioned in the system prompt for context. */
  domain: string;
  /** Text direction of the target wiki's script — NOT the same thing as the UI's own display language direction. Persian is RTL; Tajik is written in Cyrillic and is LTR. */
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
