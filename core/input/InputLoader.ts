/**
 * InputLoader
 *
 * Real implementation. Responsibility: obtain raw English Wikitext from
 * exactly one of the two supported input types (Software Specification,
 * Section 4.1). Does NOT parse Wikitext — that is ParsoidParser's job.
 *
 * URL case: uses the MediaWiki core REST API's page-source endpoint,
 * which returns the current wikitext for a page without any HTML
 * rendering involved (`GET /w/rest.php/v1/page/{title}` -> `.source`).
 *
 * File case: uses the Tauri filesystem plugin to read the file directly
 * by path. This is the one place in the core engine that depends on a
 * Tauri-specific API rather than a pure web API, because reading an
 * arbitrary local file by path has no browser equivalent — this keeps
 * that dependency isolated to a single, narrow function.
 */

import { WIKIPEDIA_DOMAIN } from "@core/config/constants";
import { PerseusError } from "@core/errors/PerseusError";
import { readTextFile } from "@tauri-apps/plugin-fs";

export type ArticleSource = { kind: "url"; url: string } | { kind: "file"; path: string };

export interface LoadedArticle {
  sourceTitle: string;
  rawWikitext: string;
  source: ArticleSource;
}

export interface InputLoader {
  load(source: ArticleSource): Promise<LoadedArticle>;
}

/**
 * Extracts the article title from an `en.wikipedia.org` URL.
 * Assumption (Software Specification, Section 4.1): the URL must resolve
 * to an `en.wikipedia.org` article, e.g. `.../wiki/Special_relativity`
 * or `...?title=Special_relativity`.
 */
function extractTitleFromUrl(rawUrl: string): string {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch (error) {
    throw new PerseusError("InputError", `"${rawUrl}" is not a valid URL.`, {
      stage: "load-article",
      cause: error,
    });
  }

  if (!/(^|\.)wikipedia\.org$/.test(url.hostname) || !url.hostname.startsWith("en.")) {
    throw new PerseusError(
      "InputError",
      `Perseus only accepts English Wikipedia article URLs (en.wikipedia.org). Got: ${url.hostname}`,
      { stage: "load-article" },
    );
  }

  const wikiPathMatch = /^\/wiki\/(.+)$/.exec(url.pathname);
  const title = wikiPathMatch
    ? decodeURIComponent(wikiPathMatch[1])
    : url.searchParams.get("title");

  if (!title) {
    throw new PerseusError("InputError", `Could not determine an article title from "${rawUrl}".`, {
      stage: "load-article",
    });
  }

  return title.replaceAll("_", " ");
}

/** Derives a title for a locally loaded file: its filename without extension, or its first `= Heading =` line if present. */
function deriveTitleFromFile(path: string, wikitext: string): string {
  const headingMatch = /^=\s*(.+?)\s*=\s*$/m.exec(wikitext);
  if (headingMatch) {
    return headingMatch[1];
  }

  const base = path.split(/[/\\]/).pop() ?? path;
  return base.replace(/\.wiki$/i, "");
}

export class WikipediaInputLoader implements InputLoader {
  async load(source: ArticleSource): Promise<LoadedArticle> {
    if (source.kind === "url") {
      const title = extractTitleFromUrl(source.url);
      const endpoint = `https://${WIKIPEDIA_DOMAIN}/w/rest.php/v1/page/${encodeURIComponent(title)}`;

      let response: Response;

      try {
        response = await fetch(endpoint);
      } catch (error) {
        throw new PerseusError("InputError", `Could not reach Wikipedia to load "${title}".`, {
          stage: "load-article",
          cause: error,
        });
      }

      if (response.status === 404) {
        throw new PerseusError(
          "InputError",
          `No English Wikipedia article titled "${title}" was found.`,
          {
            stage: "load-article",
          },
        );
      }

      if (!response.ok) {
        throw new PerseusError(
          "InputError",
          `Failed to load "${title}" (HTTP ${response.status}).`,
          {
            stage: "load-article",
            context: { status: response.status },
          },
        );
      }

      const body = (await response.json()) as {
        source?: string;
        title?: string;
      };

      if (typeof body.source !== "string") {
        throw new PerseusError(
          "InputError",
          `Wikipedia's response for "${title}" did not include article source.`,
          {
            stage: "load-article",
          },
        );
      }

      return {
        sourceTitle: body.title ?? title,
        rawWikitext: body.source,
        source,
      };
    }

    // source.kind === "file"
    let rawWikitext: string;

    try {
      rawWikitext = await readTextFile(source.path);
    } catch (error) {
      throw new PerseusError("InputError", `Could not read file "${source.path}".`, {
        stage: "load-article",
        cause: error,
      });
    }

    if (!rawWikitext.trim()) {
      throw new PerseusError("InputError", `File "${source.path}" is empty.`, {
        stage: "load-article",
      });
    }

    return {
      sourceTitle: deriveTitleFromFile(source.path, rawWikitext),
      rawWikitext,
      source,
    };
  }
}
