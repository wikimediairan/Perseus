import { SUN_ARTICLE_HTML } from "../fixtures/articles";

import { jsonResponse, setGlobalFetch, textResponse, urlOf } from "./fetchMock";
import {
  isHtmlToWikitextRequest,
  isPageSourceRequest,
  isWikidataRequest,
  isWikitextToHtmlRequest,
} from "./mediawikiEndpoints";

export interface TranslationSessionFetchOverrides {
  articleHtml?: string;
  wikidataUnreachable?: boolean;
  forbidHtmlFetch?: boolean;
}

export function createTranslationSessionFetch(
  overrides: TranslationSessionFetchOverrides = {},
): typeof fetch {
  return (input: RequestInfo | URL): Promise<Response> => {
    const url = urlOf(input);
    if (isPageSourceRequest(url))
      return Promise.resolve(jsonResponse({ title: "Sun", source: "x" }));
    if (isWikitextToHtmlRequest(url)) {
      if (overrides.forbidHtmlFetch) {
        throw new Error("Reconstruction must never call Parsoid's transform endpoint");
      }
      return Promise.resolve(textResponse(overrides.articleHtml ?? SUN_ARTICLE_HTML));
    }
    if (isHtmlToWikitextRequest(url)) return Promise.resolve(textResponse("GENERATED"));
    if (isWikidataRequest(url)) {
      if (overrides.wikidataUnreachable)
        throw new Error("Reconstruction must never contact Wikidata");
      return Promise.resolve(
        jsonResponse({
          entities: {
            Q1: { sitelinks: { enwiki: { title: "Sun" }, fawiki: { title: "خورشید" } } },
          },
        }),
      );
    }
    throw new Error("unexpected fetch: " + url);
  };
}

export function setTranslationSessionFetch(overrides?: TranslationSessionFetchOverrides): void {
  setGlobalFetch(createTranslationSessionFetch(overrides));
}
