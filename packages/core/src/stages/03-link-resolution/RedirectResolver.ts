import { WIKIMEDIA_USER_AGENT, WIKIPEDIA_API } from "../../config/constants";
import { normalizeTitle } from "../../ir/wikitextLinkUtils";
import type { Logger } from "../../platform/logging/Logger";

const BATCH_SIZE = 50;

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

interface MediaWikiQueryResponse {
  query?: {
    normalized?: { from: string; to: string }[];

    redirects?: { from: string; to: string }[];
  };
}

export async function resolveRedirects(
  titles: string[],
  logger?: Logger,
): Promise<Map<string, string>> {
  const canonicalByInput = new Map<string, string>();

  if (titles.length === 0) {
    return canonicalByInput;
  }

  for (const batch of chunk(titles, BATCH_SIZE)) {
    try {
      const params = new URLSearchParams({
        action: "query",
        titles: batch.join("|"),
        redirects: "1",
        format: "json",
        origin: "*",
      });

      const response = await fetch(`${WIKIPEDIA_API}?${params.toString()}`, {
        headers: { "User-Agent": WIKIMEDIA_USER_AGENT },
      });

      if (!response.ok) {
        logger?.warn(
          `Redirect resolution request failed (HTTP ${response.status}); continuing with un-redirected titles for this batch.`,
        );
        continue;
      }

      const body = (await response.json()) as MediaWikiQueryResponse;

      const normalizedTo = new Map<string, string>();
      for (const entry of body.query?.normalized ?? []) {
        normalizedTo.set(entry.from, entry.to);
      }

      const redirectTo = new Map<string, string>();
      for (const entry of body.query?.redirects ?? []) {
        redirectTo.set(entry.from, entry.to);
      }

      for (const inputTitle of batch) {
        const normalized = normalizedTo.get(inputTitle) ?? inputTitle;
        const canonical = redirectTo.get(normalized);
        if (canonical) {
          canonicalByInput.set(inputTitle, normalizeTitle(canonical));
        }
      }
    } catch (error) {
      logger?.warn(
        `Redirect resolution failed for a batch of titles; continuing with un-redirected titles for this batch.`,
        { cause: error instanceof Error ? error.message : String(error) },
      );
    }
  }

  return canonicalByInput;
}
