import { describe, expect, it, vi } from "vitest";
import { WIKIMEDIA_USER_AGENT, WIKIPEDIA_API } from "../src/config/constants";
import { resolveRedirects } from "../src/stages/03-link-resolution/RedirectResolver";

function mockJsonFetch(
  status: number,
  body: unknown,
): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  })) as unknown as ReturnType<typeof vi.fn>;
  vi.stubGlobal("fetch", fn);
  return fn;
}

function lastRequestUrl(fetchMock: ReturnType<typeof vi.fn>): string {
  const call = fetchMock.mock.calls.at(-1) as [string, unknown] | undefined;
  return call?.[0] ?? "";
}

function lastRequestHeaders(
  fetchMock: ReturnType<typeof vi.fn>,
): Record<string, string> {
  const call = fetchMock.mock.calls.at(-1) as
    | [string, RequestInit | undefined]
    | undefined;
  return (call?.[1]?.headers as Record<string, string>) ?? {};
}

describe("resolveRedirects", () => {
  it("returns an empty map without calling fetch when given no titles", async () => {
    const fetchMock = mockJsonFetch(200, { query: {} });
    const result = await resolveRedirects([]);

    expect(result.size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a redirect's input title to its canonical title", async () => {
    mockJsonFetch(200, {
      query: {
        redirects: [{ from: "USA", to: "United States" }],
      },
    });

    const result = await resolveRedirects(["USA"]);

    expect(result.get("USA")).toBe("United States");
  });

  it("a title that is NOT a redirect is simply absent from the returned map", async () => {
    mockJsonFetch(200, { query: {} });

    const result = await resolveRedirects(["Ada Lovelace"]);

    expect(result.has("Ada Lovelace")).toBe(false);
  });

  it("chains MediaWiki's own title normalization before applying a redirect", async () => {
    mockJsonFetch(200, {
      query: {
        normalized: [{ from: "usa", to: "USA" }],
        redirects: [{ from: "USA", to: "United States" }],
      },
    });

    const result = await resolveRedirects(["usa"]);

    expect(result.get("usa")).toBe("United States");
  });

  it("sends the canonical WIKIMEDIA_USER_AGENT header and hits the MediaWiki core API, not Wikidata", async () => {
    const fetchMock = mockJsonFetch(200, { query: {} });

    await resolveRedirects(["Some Title"]);

    expect(lastRequestUrl(fetchMock)).toContain(WIKIPEDIA_API);
    expect(lastRequestUrl(fetchMock)).toContain("redirects=1");
    expect(lastRequestHeaders(fetchMock)["User-Agent"]).toBe(
      WIKIMEDIA_USER_AGENT,
    );
  });

  it("batches more than 50 titles into multiple requests", async () => {
    const fetchMock = mockJsonFetch(200, { query: {} });
    const titles = Array.from({ length: 120 }, (_, i) => `Title ${i}`);

    await resolveRedirects(titles);

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("degrades gracefully (no throw) on a network failure, returning whatever was resolved from other batches", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("getaddrinfo ENOTFOUND"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          query: { redirects: [{ from: "USA", to: "United States" }] },
        }),
      });
    vi.stubGlobal("fetch", fn);

    const titles = [
      ...Array.from({ length: 50 }, (_, i) => `Batch1 Title ${i}`),
      "USA",
    ];

    const result = await resolveRedirects(titles);

    // First batch (network failure) contributes nothing; second batch
    // (the lone "USA" title, since batch size is 50) still resolves.
    expect(result.get("USA")).toBe("United States");
  });

  it("degrades gracefully (no throw) on a non-OK HTTP response", async () => {
    mockJsonFetch(503, { error: "Service Unavailable" });

    await expect(resolveRedirects(["USA"])).resolves.toBeInstanceOf(Map);
  });

  it("degrades gracefully (no throw) on a response that isn't valid JSON", async () => {
    const fn = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    })) as unknown as ReturnType<typeof vi.fn>;
    vi.stubGlobal("fetch", fn);

    const result = await resolveRedirects(["USA"]);
    expect(result.size).toBe(0);
  });

  it("logs a warning (via the optional logger) on failure instead of throwing", async () => {
    mockJsonFetch(500, { error: "boom" });
    const warn = vi.fn();
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn,
      error: vi.fn(),
      forStage: vi.fn(),
    };

    await resolveRedirects(["USA"], logger as never);

    expect(warn).toHaveBeenCalled();
  });
});
