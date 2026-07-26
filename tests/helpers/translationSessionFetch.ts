import { SUN_ARTICLE_HTML, SUN_PAGE_ID, SUN_REVISION_ID } from "../fixtures/articles";

import { jsonResponse, setGlobalFetch, textResponse, urlOf } from "./fetchMock";
import {
  isHtmlToWikitextRequest,
  isPageSourceRequest,
  isRevisionHtmlRequest,
  isWikidataRequest,
  isWikitextToHtmlRequest,
} from "./mediawikiEndpoints";

export interface TranslationSessionFetchOverrides {
  articleHtml?: string;
  wikidataUnreachable?: boolean;
  forbidPageSourceFetch?: boolean;
  forbidWikitextToHtmlFetch?: boolean;
}

export function createTranslationSessionFetch(
  overrides: TranslationSessionFetchOverrides = {},
): typeof fetch {
  return (input: RequestInfo | URL): Promise<Response> => {
    const url = urlOf(input);

    if (isPageSourceRequest(url)) {
      if (overrides.forbidPageSourceFetch) {
        throw new Error(
          "Reconstruction must never re-resolve the article by title, only by source.revisionId",
        );
      }
      return Promise.resolve(
        jsonResponse({
          title: "Sun",
          source: "x",
          id: SUN_PAGE_ID,
          latest: { id: SUN_REVISION_ID },
        }),
      );
    }

    if (isRevisionHtmlRequest(url)) {
      return Promise.resolve(textResponse(overrides.articleHtml ?? SUN_ARTICLE_HTML));
    }

    if (isWikitextToHtmlRequest(url)) {
      if (overrides.forbidWikitextToHtmlFetch) {
        throw new Error("Reconstruction must never call Parsoid's wikitext transform endpoint");
      }
      return Promise.resolve(textResponse(overrides.articleHtml ?? SUN_ARTICLE_HTML));
    }

    if (isHtmlToWikitextRequest(url)) return Promise.resolve(textResponse("GENERATED"));

    if (isWikidataRequest(url)) {
      if (overrides.wikidataUnreachable) throw new Error("Wikidata is unreachable");
      return Promise.resolve(
        jsonResponse({
          entities: {
            Q1: { sitelinks: { enwiki: { title: "Sun" }, fawiki: { title: "خورشید" } } },
          },
        }),
      );
    }

    throw new Error(`unexpected fetch: ${url}`);
  };
}

export function setTranslationSessionFetch(overrides?: TranslationSessionFetchOverrides): void {
  setGlobalFetch(createTranslationSessionFetch(overrides));
}
