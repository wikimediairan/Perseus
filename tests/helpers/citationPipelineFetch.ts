import { SUN_PAGE_ID, SUN_REVISION_ID } from "../fixtures/articles";
import { translateSegments } from "../fixtures/citations";

import {
  createHtmlToWikitextCapture,
  jsonResponse,
  parseJsonBody,
  textResponse,
  urlOf,
} from "./fetchMock";
import {
  isHtmlToWikitextRequest,
  isOllamaChatRequest,
  isPageSourceRequest,
  isWikidataRequest,
  isWikitextToHtmlRequest,
} from "./mediawikiEndpoints";

export function createCitationPipelineFetch(parsoidHtml: string) {
  const capture = createHtmlToWikitextCapture();

  const handler = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = urlOf(input);
    if (isPageSourceRequest(url))
      return Promise.resolve(
        jsonResponse({
          title: "Sun",
          source: "x",
          id: SUN_PAGE_ID,
          latest: { id: SUN_REVISION_ID },
        }),
      );
    if (isWikitextToHtmlRequest(url)) return Promise.resolve(textResponse(parsoidHtml));
    if (isWikidataRequest(url)) return Promise.resolve(jsonResponse({ entities: {} }));
    if (isOllamaChatRequest(url)) {
      const body = parseJsonBody<{ messages?: { content?: string }[] }>(init);
      const userMsg =
        typeof body?.messages?.[1]?.content === "string" ? body.messages[1].content : "";
      const translated = translateSegments(userMsg, (text) => `TR:${text}`);
      return Promise.resolve(jsonResponse({ message: { content: translated } }));
    }
    if (isHtmlToWikitextRequest(url)) return Promise.resolve(capture.handle(init));
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  return { handler, getCapturedHtml: capture.getCapturedHtml };
}
