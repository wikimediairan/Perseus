import { parseWikipediaArticleUrl } from "../../config/wikipedia";
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

function parseArticleUrl(rawUrl: string) {
  const parsed = parseWikipediaArticleUrl(rawUrl);

  if (parsed) {
    return parsed;
  }

  let hostname: string | undefined;

  try {
    hostname = new URL(rawUrl).hostname;
  } catch {
    try {
      hostname = new URL(`https://${rawUrl}`).hostname;
    } catch {
      hostname = undefined;
    }
  }

  if (hostname) {
    throw new PerseusError(
      "InputError",
      `Perseus accepts article URLs from any Wikipedia language edition (for example, https://de.wikipedia.org/wiki/…). Got: ${hostname}`,
      { stage: "load-article" },
    );
  }

  throw new PerseusError("InputError", `"${rawUrl}" is not a valid URL.`, {
    stage: "load-article",
  });
}

export class WikipediaInputLoader implements InputLoader {
  async load(source: ArticleSource): Promise<LoadedArticle> {
    const parsedUrl = parseArticleUrl(source.url);
    const { domain, title } = parsedUrl;
    const endpoint = `https://${domain}/w/rest.php/v1/page/${encodeURIComponent(title)}`;

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
        `No Wikipedia article titled "${title}" was found on ${domain}.`,
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
        wiki: parsedUrl.wiki,
        pageId: body.id,
        title: sourceTitle,
        revisionId: body.latest.id,
      },
    };
  }
}
