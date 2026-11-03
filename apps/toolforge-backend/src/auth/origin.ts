import { ApiError } from "../util/errors.js";

const SOURCE_WIKI_PATTERN = /^[a-z][a-z0-9_-]*wiki$/;
const WIKI_ORIGIN_PATTERN = /^https:\/\/([a-z0-9-]+)\.(m\.)?wikipedia\.org$/;

export const TARGET_WIKI_CODES = new Set(["fa", "tg"]);

// Wikipedia source wikis only. These are Wikimedia project site codes that
// also end in "wiki" but are not Wikipedia language editions.
const NON_WIKIPEDIA_WIKIS = new Set([
  "commonswiki",
  "incubatorwiki",
  "mediawikiwiki",
  "metawiki",
  "outreachwiki",
  "specieswiki",
  "wikidatawiki",
  "wikimaniawiki",
  "wikisourcewiki",
]);

export function assertSourceWiki(wiki: string): string {
  const normalized = wiki.trim().toLowerCase();
  if (!SOURCE_WIKI_PATTERN.test(normalized)) {
    throw new ApiError(
      400,
      "INVALID_SOURCE_WIKI",
      `Unsupported source wiki "${wiki}".`,
    );
  }
  if (NON_WIKIPEDIA_WIKIS.has(normalized)) {
    throw new ApiError(
      400,
      "NOT_A_WIKIPEDIA",
      "Only Wikipedia language editions can be used as a source.",
    );
  }
  const language = normalized.slice(0, -"wiki".length);
  if (TARGET_WIKI_CODES.has(language)) {
    throw new ApiError(
      400,
      "TARGET_WIKI_AS_SOURCE",
      "Persian and Tajik Wikipedia are target wikis, not source wikis.",
    );
  }
  return normalized;
}

export function sourceWikiFromOrigin(origin: string): string {
  const match = WIKI_ORIGIN_PATTERN.exec(origin);
  if (!match) {
    throw new ApiError(
      400,
      "INVALID_ORIGIN",
      "The gadget must run on a Wikipedia source wiki.",
    );
  }

  const language = match[1];
  if (!language || language === "www" || TARGET_WIKI_CODES.has(language)) {
    throw new ApiError(
      400,
      "INVALID_ORIGIN",
      "Persian and Tajik Wikipedia are target wikis, not source wikis.",
    );
  }

  return `${language}wiki`;
}

export function assertGadgetOrigin(origin: string): string {
  sourceWikiFromOrigin(origin);
  return origin;
}

export function isAllowedCorsOrigin(
  origin: string | undefined,
  extraOrigins: string[],
): boolean {
  if (!origin) return false;
  if (extraOrigins.includes(origin)) return true;
  try {
    sourceWikiFromOrigin(origin);
    return true;
  } catch {
    return false;
  }
}
