import { SOURCE_WIKI_CODE, WIKIPEDIA_DOMAIN } from "../../config/constants";
import { PerseusError } from "../../platform/errors/PerseusError";

export interface ArticleSource {
  url: string;
}

export interface ArticleRevisionSource {
  wiki: string;
  pageId: number;
  title: string;
  revisionId: number;
}

export interface LoadedArticle {
  sourceTitle: string;
  rawWikitext: string;
  source: ArticleSource;
  revision: ArticleRevisionSource;
}

export interface InputLoader {
  load(source: ArticleSource): Promise<LoadedArticle>;
}

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

  if (
    !/(^|\.)wikipedia\.org$/.test(url.hostname) ||
    !url.hostname.startsWith("en.")
  ) {
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
    throw new PerseusError(
      "InputError",
      `Could not determine an article title from "${rawUrl}".`,
      {
        stage: "load-article",
      },
    );
  }

  return title.replaceAll("_", " ");
}

export class WikipediaInputLoader implements InputLoader {
  async load(source: ArticleSource): Promise<LoadedArticle> {
    const title = extractTitleFromUrl(source.url);
    const endpoint = `https://${WIKIPEDIA_DOMAIN}/w/rest.php/v1/page/${encodeURIComponent(title)}`;

    let response: Response;

    try {
      response = await fetch(endpoint);
    } catch (error) {
      throw new PerseusError(
        "InputError",
        `Could not reach Wikipedia to load "${title}".`,
        {
          stage: "load-article",
          cause: error,
        },
      );
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
      id?: number;
      latest?: { id?: number };
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

    if (typeof body.id !== "number" || typeof body.latest?.id !== "number") {
      throw new PerseusError(
        "InputError",
        `Wikipedia's response for "${title}" did not include page/revision identifiers.`,
        {
          stage: "load-article",
        },
      );
    }

    const sourceTitle = body.title ?? title;

    return {
      sourceTitle,
      rawWikitext: body.source,
      source,
      revision: {
        wiki: SOURCE_WIKI_CODE,
        pageId: body.id,
        title: sourceTitle,
        revisionId: body.latest.id,
      },
    };
  }
}
