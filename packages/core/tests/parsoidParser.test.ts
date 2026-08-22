import { describe, expect, it, vi } from "vitest";
import { WIKIMEDIA_USER_AGENT } from "../src/config/constants";
import {
  fetchRevisionHtml,
  WikipediaParsoidParser,
} from "../src/stages/02-parsing/ParsoidParser";

/**
 * These tests deliberately only exercise fetchRevisionHtml's
 * request-sending and error-handling paths (never a 2xx response) --
 * the success path additionally parses the response with a global
 * `DOMParser`, which Core intentionally does not polyfill itself (see
 * ParsoidParser.ts's module doc and Backend's domEnvironment.ts, which
 * supplies one at the host level). None of that is what this fix
 * touches, so there's no need to stand up a DOM polyfill just to test
 * the header/error-handling change.
 */
function mockTextFetch(status: number, body: string): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  })) as unknown as ReturnType<typeof vi.fn>;
  vi.stubGlobal("fetch", fn);
  return fn;
}

function lastRequestHeaders(
  fetchMock: ReturnType<typeof vi.fn>,
): Record<string, string> {
  const call = fetchMock.mock.calls.at(-1) as
    | [string, RequestInit | undefined]
    | undefined;
  return (call?.[1]?.headers as Record<string, string>) ?? {};
}

describe("fetchRevisionHtml — Wikimedia User-Agent", () => {
  it("sends the canonical WIKIMEDIA_USER_AGENT header", async () => {
    const fetchMock = mockTextFetch(500, "");

    await fetchRevisionHtml(123).catch(() => undefined);

    const headers = lastRequestHeaders(fetchMock);
    expect(headers["User-Agent"]).toBe(WIKIMEDIA_USER_AGENT);
  });

  it("sends no Authorization header -- this is a plain, unauthenticated public request", async () => {
    const fetchMock = mockTextFetch(500, "");

    await fetchRevisionHtml(123).catch(() => undefined);

    const headers = lastRequestHeaders(fetchMock);
    expect(headers.Authorization).toBeUndefined();
  });

  it("includes status and a truncated upstream body on failure", async () => {
    mockTextFetch(
      403,
      "Access to this API has been blocked. Please supply a descriptive User-Agent header.",
    );

    try {
      await fetchRevisionHtml(123);
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({
        category: "ParsingError",
        context: { status: 403 },
      });
      const context = (error as { context?: { upstreamMessage?: string } })
        .context;
      expect(context?.upstreamMessage).toContain("User-Agent header");
      expect(context?.upstreamMessage?.length).toBeLessThanOrEqual(300);
    }
  });

  it("truncates a long upstream body to 300 characters", async () => {
    mockTextFetch(403, "x".repeat(1000));

    try {
      await fetchRevisionHtml(123);
      expect.unreachable();
    } catch (error) {
      const context = (error as { context?: { upstreamMessage?: string } })
        .context;
      expect(context?.upstreamMessage?.length).toBe(300);
    }
  });

  it("fetchParsoidHtml (via WikipediaParsoidParser.parse) sends the identical WIKIMEDIA_USER_AGENT constant -- not just a visually similar string", async () => {
    const fetchMock = mockTextFetch(500, "");
    const parser = new WikipediaParsoidParser();

    await parser
      .parse({
        sourceTitle: "Test",
        rawWikitext: "hello",
        source: { url: "https://en.wikipedia.org/wiki/Test" },
        revision: { wiki: "enwiki", pageId: 1, title: "Test", revisionId: 1 },
      })
      .catch(() => undefined);

    const headers = lastRequestHeaders(fetchMock);
    expect(headers["User-Agent"]).toBe(WIKIMEDIA_USER_AGENT);
  });

  it("still throws a clean ParsingError (no upstreamMessage) if the body can't be read", async () => {
    const fn = vi.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => {
        throw new Error("stream already consumed");
      },
    })) as unknown as ReturnType<typeof vi.fn>;
    vi.stubGlobal("fetch", fn);

    await expect(fetchRevisionHtml(123)).rejects.toMatchObject({
      category: "ParsingError",
      context: { status: 500 },
    });
  });

  it("marks a 403 as not retryable and a 503 as retryable", async () => {
    mockTextFetch(403, "");
    await expect(fetchRevisionHtml(123)).rejects.toMatchObject({
      context: { status: 403, retryable: false },
    });

    mockTextFetch(503, "");
    await expect(fetchRevisionHtml(123)).rejects.toMatchObject({
      context: { status: 503, retryable: true },
    });
  });

  it("still throws the specific not-found message for a 404, unaffected by the header change", async () => {
    mockTextFetch(404, "");

    await expect(fetchRevisionHtml(999)).rejects.toMatchObject({
      category: "ParsingError",
      message: expect.stringContaining("could not be found"),
    });
  });
});
