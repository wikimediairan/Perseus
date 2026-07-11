import "./helpers/setupDom";
import {
  createHtmlToWikitextCapture,
  jsonResponse,
  setGlobalFetch,
  textResponse,
  urlOf,
} from "./helpers/fetchMock";
import {
  isHtmlToWikitextRequest,
  isOllamaChatRequest,
  isPageSourceRequest,
  isWikidataRequest,
  isWikitextToHtmlRequest,
} from "./helpers/mediawikiEndpoints";
import { createOllamaPipeline, SUN_ARTICLE_REQUEST } from "./helpers/pipeline";

describe("Smoke Test (E2E)", () => {
  const calls: { url: string }[] = [];
  let result: { wikitext: string };
  let sentHtml: string;

  beforeAll(async () => {
    const generator = createHtmlToWikitextCapture("GENERATED_PERSIAN_WIKITEXT_OK");

    setGlobalFetch((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = urlOf(input);
      calls.push({ url });

      if (isPageSourceRequest(url)) {
        return Promise.resolve(
          jsonResponse({ title: "Sun", source: "The [[Sun]] is a star. It is very hot." }),
        );
      }
      if (isWikitextToHtmlRequest(url)) {
        return Promise.resolve(
          textResponse(
            `<p>The <a rel="mw:WikiLink" href="./Sun">Sun</a> is a star.</p><p>It is very hot.</p>`,
          ),
        );
      }
      if (isWikidataRequest(url)) {
        return Promise.resolve(
          jsonResponse({
            entities: {
              Q525: {
                sitelinks: { enwiki: { title: "Sun" }, fawiki: { title: "خورشید" } },
              },
            },
          }),
        );
      }
      if (isOllamaChatRequest(url)) {
        return Promise.resolve(
          jsonResponse({
            message: {
              content:
                "[[SEGMENT 1]]\n\u27EA1\u27EB\u062E\u0648\u0631\u0634\u06CC\u062F\u27EA/1\u27EB \u06CC\u06A9 \u0633\u062A\u0627\u0631\u0647 \u0627\u0633\u062A.\n\n[[SEGMENT 2]]\n\u062E\u06CC\u0644\u06CC \u06AF\u0631\u0645 \u0627\u0633\u062A.",
            },
          }),
        );
      }

      if (isHtmlToWikitextRequest(url)) return Promise.resolve(generator.handle(init));

      throw new Error(`Unmocked fetch: ${url}`);
    });

    const pipeline = await createOllamaPipeline();
    result = await pipeline.run(SUN_ARTICLE_REQUEST);
    sentHtml = generator.getCapturedHtml();
  });

  it("result is the mocked generated wikitext", () => {
    expect(result.wikitext).toBe("GENERATED_PERSIAN_WIKITEXT_OK");
  });

  it("sent HTML contains translated Persian text", () => {
    expect(sentHtml.includes("خورشید")).toBe(true);
  });

  it("sent HTML preserved the <a> tag around the translated link label", () => {
    expect(/<a[^>]*>خورشید<\/a>/.test(sentHtml)).toBe(true);
  });

  it("sent HTML link href was updated to the Persian-resolved target", () => {
    expect(sentHtml.includes('href="./' + encodeURIComponent("خورشید") + '"')).toBe(true);
  });

  it("sent HTML contains second paragraph's translation", () => {
    expect(sentHtml.includes("خیلی گرم است")).toBe(true);
  });

  it("wikidata was queried", () => {
    expect(calls.some((c) => c.url.includes("wikidata.org"))).toBe(true);
  });

  it("ollama chat was called exactly once (one chunk)", () => {
    expect(calls.filter((c) => c.url.includes("/api/chat")).length).toBe(1);
  });
});
