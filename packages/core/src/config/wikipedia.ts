import { SOURCE_WIKI_CODE } from "./constants";

const WIKIPEDIA_WIKI_CODE_PATTERN = /^[a-z][a-z0-9_-]*wiki$/i;
const WIKIPEDIA_LANGUAGE_CODE_PATTERN = /^[a-z][a-z0-9-]*$/;

const WIKIDATA_SITE_KEY_OVERRIDES: Record<string, string> = {
  "be-taraskwiki": "be_x_oldwiki",
};

const LANGUAGE_CODE_OVERRIDES: Record<string, string> = {
  be_x_oldwiki: "be-tarask",
};

export interface WikipediaSource {
  languageCode: string;
  wiki: string;
  domain: string;
}

export interface ParsedWikipediaArticleUrl extends WikipediaSource {
  title: string;
  url: string;
}

function parseWikipediaHostname(hostname: string): string | null {
  const host = hostname.toLowerCase().replace(/\.$/, "");

  const mobileMatch = /^([a-z][a-z0-9-]*)\.m\.wikipedia\.org$/.exec(host);
  const desktopMatch = /^([a-z][a-z0-9-]*)\.wikipedia\.org$/.exec(host);
  const languageCode = mobileMatch?.[1] ?? desktopMatch?.[1];

  if (
    !languageCode ||
    languageCode === "www" ||
    !WIKIPEDIA_LANGUAGE_CODE_PATTERN.test(languageCode)
  ) {
    return null;
  }

  return languageCode;
}

export function parseWikipediaArticleUrl(
  rawUrl: string,
): ParsedWikipediaArticleUrl | null {
  const trimmed = rawUrl.trim();

  if (!trimmed) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(trimmed);
  } catch {
    try {
      url = new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }

  const languageCode = parseWikipediaHostname(url.hostname);

  if (!languageCode) {
    return null;
  }

  const wikiPathMatch = /^\/wiki\/(.+)$/.exec(url.pathname);
  const encodedTitle =
    wikiPathMatch?.[1] ?? url.searchParams.get("title") ?? undefined;

  if (!encodedTitle) {
    return null;
  }

  let title: string;

  try {
    title = decodeURIComponent(encodedTitle);
  } catch {
    title = encodedTitle;
  }

  title = title.replaceAll("_", " ").trim();

  if (!title) {
    return null;
  }

  return {
    languageCode,
    wiki: wikipediaWikiCodeForLanguage(languageCode),
    domain: wikipediaDomainForLanguage(languageCode),
    title,
    url: url.toString(),
  };
}

export function detectWikipediaSource(rawUrl: string): null | WikipediaSource {
  const parsed = parseWikipediaArticleUrl(rawUrl);

  if (!parsed) {
    return null;
  }

  return {
    languageCode: parsed.languageCode,
    wiki: parsed.wiki,
    domain: parsed.domain,
  };
}

export function wikipediaWikiCodeForLanguage(languageCode: string): string {
  return `${languageCode.trim().toLowerCase()}wiki`;
}

export function wikipediaDomainForLanguage(languageCode: string): string {
  return `${languageCode.trim().toLowerCase()}.wikipedia.org`;
}

export function wikipediaApiForDomain(domain: string): string {
  return `https://${domain}/w/api.php`;
}

export function languageCodeFromWiki(wiki: string): string {
  const normalized = wiki.trim();

  const overriddenLanguageCode =
    LANGUAGE_CODE_OVERRIDES[normalized.toLowerCase()];

  if (overriddenLanguageCode) {
    return overriddenLanguageCode;
  }

  if (!normalized.toLowerCase().endsWith("wiki")) {
    return normalized || "en";
  }

  return normalized.slice(0, -4).replaceAll("_", "-") || "en";
}

export function wikipediaDomainFromWiki(wiki: string): string {
  return wikipediaDomainForLanguage(languageCodeFromWiki(wiki));
}

export function languageCodeFromDomain(domain: string): string {
  const match = /^([a-z][a-z0-9-]*)\.wikipedia\.org$/i.exec(
    domain.trim().toLowerCase(),
  );

  return match?.[1] ?? "en";
}

export function wikipediaWikiCodeFromDomain(domain: string): string {
  return wikipediaWikiCodeForLanguage(languageCodeFromDomain(domain));
}

export function wikidataSiteKeyFromWiki(wiki: string): string {
  const normalized = wiki.trim().toLowerCase();

  if (!normalized) {
    return SOURCE_WIKI_CODE;
  }

  return (
    WIKIDATA_SITE_KEY_OVERRIDES[normalized] ?? normalized.replaceAll("-", "_")
  );
}

export function isWikipediaWikiCode(value: string): boolean {
  return WIKIPEDIA_WIKI_CODE_PATTERN.test(value.trim());
}
