import { DOMParser } from "linkedom";

(globalThis as any).DOMParser = DOMParser;

describe("Smoke Test (E2E)", () => {
  const calls: { url: string; body?: string }[] = [];
  let result: { wikitext: string };
  let sentHtml: string;

  beforeAll(async () => {
    // ---- Mock fetch: dispatch by URL substring, so real modules exercise real logic ----
    (globalThis as any).fetch = async (url: string, init?: RequestInit) => {
      const bodyStr = typeof init?.body === "string" ? init.body : undefined;
      calls.push({ url, body: bodyStr });

      const json = (data: unknown, ok = true, status = 200) =>
        ({ ok, status, json: async () => data, text: async () => JSON.stringify(data) }) as Response;
      const text = (data: string, ok = true, status = 200) =>
        ({ ok, status, text: async () => data, json: async () => ({}) }) as Response;

      if (url.includes("/w/rest.php/v1/page/")) {
        return json({ title: "Sun", source: "The [[Sun]] is a star. It is very hot." });
      }
      if (url.includes("/api/rest_v1/transform/wikitext/to/html/")) {
        return text(`<p>The <a rel="mw:WikiLink" href="./Sun">Sun</a> is a star.</p><p>It is very hot.</p>`);
      }
      if (url.includes("wikidata.org/w/api.php")) {
        return json({
          entities: {
            Q525: {
              sitelinks: {
                enwiki: { title: "Sun" },
                fawiki: { title: "خورشید" },
              },
            },
          },
        });
      }
      if (url.includes("/api/chat")) {
        // Ollama chat endpoint: return a segmented translation preserving placeholder tokens.
        return json({
          message: {
            content:
              "[[SEGMENT 1]]\n\u27EA1\u27EB\u062E\u0648\u0631\u0634\u06CC\u062F\u27EA/1\u27EB \u06CC\u06A9 \u0633\u062A\u0627\u0631\u0647 \u0627\u0633\u062A.\n\n[[SEGMENT 2]]\n\u062E\u06CC\u0644\u06CC \u06AF\u0631\u0645 \u0627\u0633\u062A.",
          },
        });
      }
      if (url.includes("/api/rest_v1/transform/html/to/wikitext/")) {
        return text("GENERATED_PERSIAN_WIKITEXT_OK");
      }

      throw new Error(`Unmocked fetch: ${url}`);
    };

    const { createPipeline } = await import("@core/createPipeline");
    const { DEFAULT_CONFIG } = await import("@core/config/Config");
    const { ConsoleLogger } = await import("@core/logging/Logger");

    const config = { ...DEFAULT_CONFIG, activeProvider: { kind: "ollama" as const, model: "llama3", baseUrl: "http://localhost:11434" } };
    const pipeline = createPipeline(config, new ConsoleLogger());

    result = await pipeline.run({ kind: "url", url: "https://en.wikipedia.org/wiki/Sun" });

    const genCall = calls.find((c) => c.url.includes("transform/html/to/wikitext"));
    sentHtml = genCall?.body ? JSON.parse(genCall.body).html : "";
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
