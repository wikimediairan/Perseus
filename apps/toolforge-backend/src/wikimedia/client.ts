import type { AppConfig } from "../config.js";
import type {
  SourceInspection,
  SourcePage,
  TargetEquivalent,
  TargetWikiCode,
} from "../domain/types.js";
import { buildSections, type SectionBuildResult } from "../perseus/sections.js";
import { ApiError } from "../util/errors.js";

const LANGUAGE_OVERRIDES: Record<string, string> = {
  be_x_oldwiki: "be-tarask",
};

const SITE_KEY_OVERRIDES: Record<string, string> = {
  "be-taraskwiki": "be_x_oldwiki",
};

export function domainFromWiki(wiki: string): string {
  const normalized = wiki.toLowerCase();
  const language =
    LANGUAGE_OVERRIDES[normalized] ??
    normalized.replace(/wiki$/, "").replaceAll("_", "-");
  return `${language}.wikipedia.org`;
}

export function pageUrl(domain: string, title: string): string {
  return `https://${domain}/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`;
}

function wikipediaApi(domain: string): string {
  return `https://${domain}/w/api.php`;
}

interface PageInfoResponse {
  query?: {
    pages?: {
      pageid?: number;
      ns?: number;
      title?: string;
      missing?: boolean;
      redirect?: boolean;
      lastrevid?: number;
      pageprops?: { disambiguation?: string };
    }[];
  };
}

interface WikidataResponse {
  entities?: Record<string, { sitelinks?: Record<string, { title?: string }> }>;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  _config: AppConfig,
  attempts = 3,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(25_000),
      });
      if (response.ok) return response;
      if (response.status !== 429 && response.status < 500) {
        throw new ApiError(
          502,
          "WIKIMEDIA_UPSTREAM_ERROR",
          `Wikimedia returned HTTP ${response.status}.`,
          { status: response.status },
        );
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (error instanceof ApiError) throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** attempt));
  }

  throw new ApiError(
    502,
    "WIKIMEDIA_UNREACHABLE",
    "Could not reach Wikimedia after several attempts.",
    {
      cause: lastError instanceof Error ? lastError.message : String(lastError),
    },
  );
}

export interface LoadedSource {
  page: SourcePage;
  html: string;
  sections: SectionBuildResult;
}

export async function loadSource(
  config: AppConfig,
  wiki: string,
  title: string,
  requestedRevisionId?: number,
): Promise<LoadedSource> {
  const domain = domainFromWiki(wiki);
  const params = new URLSearchParams({
    action: "query",
    titles: title,
    prop: "info|pageprops",
    ppprop: "disambiguation",
    format: "json",
    formatversion: "2",
    redirects: "0",
  });

  const response = await fetchWithRetry(
    `${wikipediaApi(domain)}?${params.toString()}`,
    {
      headers: {
        "User-Agent": config.userAgent,
        Accept: "application/json",
      },
    },
    config,
  );

  const body = (await response.json()) as PageInfoResponse;
  const page = body.query?.pages?.[0];

  if (!page || page.missing) {
    throw new ApiError(
      404,
      "SOURCE_NOT_FOUND",
      `The page "${title}" was not found on ${domain}.`,
    );
  }

  const pageId = Number(page.pageid ?? 0);
  const revisionId = Number(page.lastrevid ?? 0);
  const namespace = Number(page.ns ?? 0);
  const pageTitle = page.title ?? title;

  if (!pageId || !revisionId) {
    throw new ApiError(
      502,
      "SOURCE_METADATA_INVALID",
      "Wikimedia did not return page/revision identifiers.",
    );
  }

  if (requestedRevisionId && requestedRevisionId !== revisionId) {
    throw new ApiError(
      409,
      "SOURCE_CHANGED",
      "The article changed while you were configuring the job. Reload the page and try again.",
      { latestRevisionId: revisionId },
    );
  }

  const sourcePage: SourcePage = {
    wiki,
    domain,
    title: pageTitle,
    pageId,
    revisionId,
    url: pageUrl(domain, pageTitle),
    namespace,
    redirect: Boolean(page.redirect),
    disambiguation: page.pageprops?.disambiguation !== undefined,
    fetchedAt: new Date().toISOString(),
  };

  if (namespace !== 0 || sourcePage.redirect || sourcePage.disambiguation) {
    return {
      page: sourcePage,
      html: "",
      sections: {
        tree: [],
        flat: [],
        hasOwnText: {},
        blocksBySection: new Map(),
        headingIds: new Map(),
      },
    };
  }

  const htmlResponse = await fetchWithRetry(
    `https://${domain}/w/rest.php/v1/revision/${revisionId}/html`,
    {
      headers: {
        "User-Agent": config.userAgent,
        Accept: "text/html",
      },
    },
    config,
  );

  const fullHtml = await htmlResponse.text();
  if (Buffer.byteLength(fullHtml, "utf8") > config.maxArticleBytes) {
    throw new ApiError(
      413,
      "SOURCE_TOO_LARGE",
      "This article is too large for the current MVP limit.",
      { maxBytes: config.maxArticleBytes },
    );
  }

  const bodyHtml = extractBodyHtml(fullHtml);

  return {
    page: sourcePage,
    html: bodyHtml,
    sections: buildSections(bodyHtml),
  };
}

function extractBodyHtml(html: string): string {
  const match = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  return match?.[1]?.trim() || html;
}

export async function loadTargetEquivalent(
  config: AppConfig,
  sourceWiki: string,
  sourceTitle: string,
  targetWiki: TargetWikiCode,
): Promise<TargetEquivalent | null> {
  try {
    const siteKey =
      SITE_KEY_OVERRIDES[sourceWiki] ?? sourceWiki.replaceAll("-", "_");
    const targetSiteKey = `${targetWiki}wiki`;
    const params = new URLSearchParams({
      action: "wbgetentities",
      sites: siteKey,
      titles: sourceTitle,
      props: "sitelinks",
      sitefilter: targetSiteKey,
      format: "json",
      origin: "*",
    });

    const response = await fetchWithRetry(
      `https://www.wikidata.org/w/api.php?${params.toString()}`,
      {
        headers: {
          "User-Agent": config.userAgent,
          Accept: "application/json",
        },
      },
      config,
      2,
    );

    const body = (await response.json()) as WikidataResponse;
    for (const entity of Object.values(body.entities ?? {})) {
      const targetTitle = entity.sitelinks?.[targetSiteKey]?.title;
      if (targetTitle) {
        return {
          title: targetTitle,
          url: pageUrl(`${targetWiki}.wikipedia.org`, targetTitle),
          found: true,
        };
      }
    }
    return { title: "", url: "", found: false };
  } catch {
    // Wikidata is advisory here. A failure must not block translation.
    return null;
  }
}

export async function inspectSource(
  config: AppConfig,
  wiki: string,
  title: string,
  targetWiki: TargetWikiCode = "fa",
): Promise<SourceInspection & { html: string }> {
  const loaded = await loadSource(config, wiki, title);

  let eligible = true;
  let reason: SourceInspection["reason"] = "ok";
  let message = "The article can be translated.";

  if (loaded.page.namespace !== 0) {
    eligible = false;
    reason = "namespace";
    message = "Only main-namespace articles can be translated.";
  } else if (loaded.page.redirect) {
    eligible = false;
    reason = "redirect";
    message =
      "Redirect pages cannot be translated. Open the target article instead.";
  } else if (loaded.page.disambiguation) {
    eligible = false;
    reason = "disambiguation";
    message = "Disambiguation pages cannot be translated.";
  }

  const targetEquivalent =
    loaded.page.namespace === 0 &&
    !loaded.page.redirect &&
    !loaded.page.disambiguation
      ? await loadTargetEquivalent(
          config,
          loaded.page.wiki,
          loaded.page.title,
          targetWiki,
        )
      : null;

  return {
    page: loaded.page,
    html: loaded.html,
    eligible,
    reason,
    message,
    sections: loaded.sections.tree,
    targetEquivalent,
    warnings: [],
  };
}
