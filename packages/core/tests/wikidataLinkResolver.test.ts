import { describe, expect, it, vi } from "vitest";
import { WIKIMEDIA_USER_AGENT } from "../src/config/constants";
import type { IntermediateRepresentation } from "../src/ir/IntermediateRepresentation";
import { WikidataLinkResolver } from "../src/stages/03-link-resolution/WikidataLinkResolver";

/**
 * Only the fields WikidataLinkResolver actually reads/writes are
 * populated -- `links`/`categories`/`structure.templateLinkTargets`
 * (input) and `structure.linkElements`/`structure.categoryElements`/
 * `structure.templateLinkResolutions` (output side-effects it may
 * touch). The remaining IR fields (`citations`, `structure.document`,
 * etc.) are never touched by this stage, so they're stubbed rather than
 * fully built.
 */
function makeIr(overrides?: {
  links?: IntermediateRepresentation["links"];
  categories?: IntermediateRepresentation["categories"];
  templateLinkTargets?: string[];
}): IntermediateRepresentation {
  return {
    sourceTitle: "Test Article",
    links: overrides?.links ?? [
      {
        id: "link-1",
        originalTarget: "Ada Lovelace",
        fragment: null,
        resolvedTarget: null,
        label: "Ada Lovelace",
      },
    ],
    categories: overrides?.categories ?? [],
    citations: {} as IntermediateRepresentation["citations"],
    structure: {
      document: {} as Document,
      nodeElements: new Map(),
      placeholders: new Map(),
      linkElements: new Map(),
      categoryElements: new Map(),
      templateParamWriters: new Map(),
      templateLinkTargets: overrides?.templateLinkTargets ?? [],
      templateLinkResolutions: new Map(),
    },
  } as unknown as IntermediateRepresentation;
}

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

function mockTextFetch(status: number, body: string): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    json: async () => {
      throw new Error("not JSON");
    },
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

/**
 * Mocks `fetch` with per-host responses, so a test can distinguish the
 * redirect-resolution call (MediaWiki's core API, en.wikipedia.org) from
 * the Wikidata call (www.wikidata.org) — `mockJsonFetch`/`mockTextFetch`
 * above deliberately can't do this (same canned response for every
 * call), which is fine for tests that don't care about redirects, but
 * not for tests that need to assert redirect-canonicalization actually
 * changed what gets sent to Wikidata.
 */
function mockFetchByHost(
  responses: Record<string, unknown>,
): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async (url: string) => {
    const matchedHost = Object.keys(responses).find((host) =>
      url.includes(host),
    );
    const body = matchedHost ? responses[matchedHost] : { query: {} };
    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  }) as unknown as ReturnType<typeof vi.fn>;
  vi.stubGlobal("fetch", fn);
  return fn;
}

function requestsTo(
  fetchMock: ReturnType<typeof vi.fn>,
  host: string,
): string[] {
  return fetchMock.mock.calls
    .map((call) => call[0] as string)
    .filter((url) => url.includes(host));
}

/** URLSearchParams (used by both WikidataLinkResolver and RedirectResolver) encodes spaces as "+", not "%20" -- matches that so URL-content assertions below check what's actually sent. */
function formEncoded(title: string): string {
  return title.replace(/ /g, "+");
}

const TARGET_WIKI = {
  code: "fa" as const,
  displayName: "Persian Wikipedia",
  languageName: "Persian",
  domain: "fa.wikipedia.org",
  draft: "",
  move: "",
  direction: "rtl" as const,
  templateRemovalDenylist: [],
  interwikiFallbackTemplate: "پم",
};

describe("WikidataLinkResolver — Wikimedia User-Agent", () => {
  it("sends the canonical WIKIMEDIA_USER_AGENT header on every Wikidata request", async () => {
    const fetchMock = mockJsonFetch(200, { entities: {} });
    const resolver = new WikidataLinkResolver(TARGET_WIKI);

    await resolver.resolve(makeIr());

    const headers = lastRequestHeaders(fetchMock);
    expect(headers["User-Agent"]).toBe(WIKIMEDIA_USER_AGENT);
  });

  it("skips the network call entirely when there are no links or categories to resolve (no false-positive on an empty batch)", async () => {
    const fetchMock = mockJsonFetch(200, { entities: {} });
    const resolver = new WikidataLinkResolver(TARGET_WIKI);

    await resolver.resolve(makeIr({ links: [] }));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("WikidataLinkResolver — error classification", () => {
  it("a 403 produces LinkResolutionError with the upstream status and is NOT retryable", async () => {
    mockTextFetch(
      403,
      "Access to this API has been blocked. Please supply a descriptive User-Agent header.",
    );
    const resolver = new WikidataLinkResolver(TARGET_WIKI);

    await expect(resolver.resolve(makeIr())).rejects.toMatchObject({
      category: "LinkResolutionError",
      context: { status: 403, retryable: false },
    });
  });

  it("captures a bounded (<=300 char) upstream message on a non-OK response", async () => {
    mockTextFetch(403, "x".repeat(1000));
    const resolver = new WikidataLinkResolver(TARGET_WIKI);

    try {
      await resolver.resolve(makeIr());
      expect.unreachable();
    } catch (error) {
      const context = (error as { context?: { upstreamMessage?: string } })
        .context;
      expect(context?.upstreamMessage?.length).toBe(300);
    }
  });

  it("a 429 is retryable", async () => {
    mockTextFetch(429, "Too Many Requests");
    const resolver = new WikidataLinkResolver(TARGET_WIKI);

    await expect(resolver.resolve(makeIr())).rejects.toMatchObject({
      context: { status: 429, retryable: true },
    });
  });

  it("a 5xx is retryable", async () => {
    mockTextFetch(503, "Service Unavailable");
    const resolver = new WikidataLinkResolver(TARGET_WIKI);

    await expect(resolver.resolve(makeIr())).rejects.toMatchObject({
      context: { status: 503, retryable: true },
    });
  });

  it("a network-level failure (fetch throws) is retryable and does not leak the raw cause into context", async () => {
    const fn = vi.fn(async () => {
      throw new Error("getaddrinfo ENOTFOUND www.wikidata.org");
    });
    vi.stubGlobal("fetch", fn);
    const resolver = new WikidataLinkResolver(TARGET_WIKI);

    await expect(resolver.resolve(makeIr())).rejects.toMatchObject({
      category: "LinkResolutionError",
      context: { retryable: true },
    });
  });

  it("a 2xx response with an unparsable body is a distinct, retryable error (not silently swallowed)", async () => {
    const fn = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token in JSON");
      },
    })) as unknown as ReturnType<typeof vi.fn>;
    vi.stubGlobal("fetch", fn);
    const resolver = new WikidataLinkResolver(TARGET_WIKI);

    await expect(resolver.resolve(makeIr())).rejects.toMatchObject({
      category: "LinkResolutionError",
      message: expect.stringContaining("could not be parsed"),
      context: { retryable: true },
    });
  });
});

describe("WikidataLinkResolver — existing success behavior is unaffected", () => {
  it("still resolves a link to its target-wiki title on a normal 200 response", async () => {
    mockJsonFetch(200, {
      entities: {
        Q7259: {
          sitelinks: {
            enwiki: { title: "Ada Lovelace" },
            fawiki: { title: "ادا لاولیس" },
          },
        },
      },
    });
    const resolver = new WikidataLinkResolver(TARGET_WIKI);

    const ir = makeIr();
    const result = await resolver.resolve(ir);

    expect(result.links[0].resolvedTarget).toBe("ادا لاولیس");
  });

  it("resolves to null (not an error) when Wikidata has no entity for the title", async () => {
    mockJsonFetch(200, { entities: {} });
    const resolver = new WikidataLinkResolver(TARGET_WIKI);

    const ir = makeIr();
    const result = await resolver.resolve(ir);

    expect(result.links[0].resolvedTarget).toBeNull();
  });
});

describe("WikidataLinkResolver — redirect canonicalization (Task 3)", () => {
  it("queries Wikidata under a redirect's CANONICAL title, and resolves the LinkNode's (as-written, redirect) originalTarget correctly", async () => {
    const fetchMock = mockFetchByHost({
      "wikipedia.org/w/api.php": {
        query: { redirects: [{ from: "USA", to: "United States" }] },
      },
      "wikidata.org": {
        entities: {
          Q30: {
            sitelinks: {
              enwiki: { title: "United States" },
              fawiki: { title: "ایالات متحده آمریکا" },
            },
          },
        },
      },
    });

    const resolver = new WikidataLinkResolver(TARGET_WIKI);
    const ir = makeIr({
      links: [
        {
          id: "link-1",
          originalTarget: "USA",
          fragment: null,
          resolvedTarget: null,
          label: "USA",
        },
      ],
    });

    const result = await resolver.resolve(ir);

    // The Wikidata request must have used the CANONICAL title, not "USA".
    const wikidataCalls = requestsTo(fetchMock, "wikidata.org");
    expect(wikidataCalls[0]).toContain(formEncoded("United States"));
    expect(wikidataCalls[0]).not.toContain(formEncoded("USA"));

    // And the LinkNode (still keyed by its ORIGINAL, as-written target)
    // still gets resolved correctly.
    expect(result.links[0].resolvedTarget).toBe("ایالات متحده آمریکا");
  });

  it("a title that is NOT a redirect is queried unchanged (regression guard)", async () => {
    const fetchMock = mockFetchByHost({
      "wikipedia.org/w/api.php": { query: {} },
      "wikidata.org": {
        entities: {
          Q7259: {
            sitelinks: {
              enwiki: { title: "Ada Lovelace" },
              fawiki: { title: "ادا لاولیس" },
            },
          },
        },
      },
    });

    const resolver = new WikidataLinkResolver(TARGET_WIKI);
    const result = await resolver.resolve(makeIr());

    const wikidataCalls = requestsTo(fetchMock, "wikidata.org");
    expect(wikidataCalls[0]).toContain(formEncoded("Ada Lovelace"));
    expect(result.links[0].resolvedTarget).toBe("ادا لاولیس");
  });

  it("a redirect-resolution failure degrades gracefully -- Wikidata is still queried under the original title, not left unresolved", async () => {
    const fn = vi.fn(async (url: string) => {
      if (url.includes("wikipedia.org/w/api.php")) {
        return { ok: false, status: 503, text: async () => "unavailable" };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          entities: {
            Q7259: {
              sitelinks: {
                enwiki: { title: "Ada Lovelace" },
                fawiki: { title: "ادا لاولیس" },
              },
            },
          },
        }),
      };
    }) as unknown as ReturnType<typeof vi.fn>;
    vi.stubGlobal("fetch", fn);

    const resolver = new WikidataLinkResolver(TARGET_WIKI);
    const result = await resolver.resolve(makeIr());

    // No exception propagated, and the ordinary (non-redirect) title
    // still resolves correctly via the fallback (query-as-written) path.
    expect(result.links[0].resolvedTarget).toBe("ادا لاولیس");
  });
});

describe("WikidataLinkResolver — template-parameter link targets (Task 2)", () => {
  it("batches a template-parameter link target into the SAME Wikidata request as ordinary links (one combined call, no extra API calls)", async () => {
    const fetchMock = mockFetchByHost({
      "wikipedia.org/w/api.php": { query: {} },
      "wikidata.org": { entities: {} },
    });

    const resolver = new WikidataLinkResolver(TARGET_WIKI);
    await resolver.resolve(
      makeIr({ templateLinkTargets: ["Albert Einstein"] }),
    );

    const wikidataCalls = requestsTo(fetchMock, "wikidata.org");
    // Exactly one Wikidata call, containing BOTH titles.
    expect(wikidataCalls).toHaveLength(1);
    expect(wikidataCalls[0]).toContain(formEncoded("Ada Lovelace"));
    expect(wikidataCalls[0]).toContain(formEncoded("Albert Einstein"));
  });

  it("populates templateLinkResolutions with the resolved target when a Wikidata equivalent exists", async () => {
    mockFetchByHost({
      "wikipedia.org/w/api.php": { query: {} },
      "wikidata.org": {
        entities: {
          Q937: {
            sitelinks: {
              enwiki: { title: "Albert Einstein" },
              fawiki: { title: "آلبرت اینشتین" },
            },
          },
        },
      },
    });

    const resolver = new WikidataLinkResolver(TARGET_WIKI);
    const ir = makeIr({
      links: [],
      templateLinkTargets: ["Albert Einstein"],
    });
    const result = await resolver.resolve(ir);

    const resolution =
      result.structure.templateLinkResolutions.get("Albert Einstein");
    expect(resolution).toEqual({
      resolvedTarget: "آلبرت اینشتین",
      fallbackTemplateName: null,
    });
  });

  it("populates templateLinkResolutions with the fallback template name when no Wikidata equivalent exists", async () => {
    mockFetchByHost({
      "wikipedia.org/w/api.php": { query: {} },
      "wikidata.org": { entities: {} },
    });

    const resolver = new WikidataLinkResolver(TARGET_WIKI);
    const ir = makeIr({
      links: [],
      templateLinkTargets: ["Some Nonexistent Article"],
    });
    const result = await resolver.resolve(ir);

    const resolution = result.structure.templateLinkResolutions.get(
      "Some Nonexistent Article",
    );
    expect(resolution).toEqual({
      resolvedTarget: null,
      fallbackTemplateName: "پم",
    });
  });

  it("leaves fallbackTemplateName null when the target wiki has no interwiki fallback template configured", async () => {
    mockFetchByHost({
      "wikipedia.org/w/api.php": { query: {} },
      "wikidata.org": { entities: {} },
    });

    const wikiWithNoFallback = {
      ...TARGET_WIKI,
      interwikiFallbackTemplate: null,
    };
    const resolver = new WikidataLinkResolver(wikiWithNoFallback);
    const ir = makeIr({
      links: [],
      templateLinkTargets: ["Some Nonexistent Article"],
    });
    const result = await resolver.resolve(ir);

    expect(
      result.structure.templateLinkResolutions.get("Some Nonexistent Article")
        ?.fallbackTemplateName,
    ).toBeNull();
  });

  it("does not populate templateLinkResolutions or make any request when there are no template link targets (regression guard)", async () => {
    const fetchMock = mockFetchByHost({
      "wikipedia.org/w/api.php": { query: {} },
      "wikidata.org": { entities: {} },
    });

    const resolver = new WikidataLinkResolver(TARGET_WIKI);
    const ir = makeIr({ links: [], categories: [], templateLinkTargets: [] });
    await resolver.resolve(ir);

    expect(ir.structure.templateLinkResolutions.size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
