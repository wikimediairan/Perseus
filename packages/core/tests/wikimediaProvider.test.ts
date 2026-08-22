import { describe, expect, it, vi } from "vitest";
import { ConsoleLogger } from "../src/platform/logging/Logger";
import type { Chunk } from "../src/stages/05-chunking/Chunker";
import type { WikimediaResponse } from "../src/wikimedia-provider/contract";
import { WikimediaProvider } from "../src/wikimedia-provider/WikimediaProvider";
import { WikimediaTranslator } from "../src/wikimedia-provider/WikimediaTranslator";

function mockWikimediaFetch(
  status: number,
  body: WikimediaResponse | Record<string, unknown>,
): ReturnType<typeof vi.fn> {
  const raw = JSON.stringify(body);
  const fn = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => raw,
  })) as unknown as ReturnType<typeof vi.fn>;
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("WikimediaProvider — credential is a session token, not an apiKey", () => {
  it("throws ConfigurationError, with a sign-in message (not an API-key message), when no token is set", async () => {
    const provider = new WikimediaProvider(undefined);

    await expect(
      provider.translate({
        model: "deepseek/deepseek-v4-pro",
        source: { wiki: "enwiki", pageId: 1, revisionId: 1 },
        chunk: "all",
        targetWiki: "fa",
      }),
    ).rejects.toMatchObject({
      category: "ConfigurationError",
      message: expect.stringContaining("Sign in with Wikimedia"),
    });
  });

  it("sends the session token as a Bearer credential, exactly like the other providers", async () => {
    const response: WikimediaResponse = {
      source: { wiki: "enwiki", pageId: 1, revisionId: 1 },
      targetWiki: "fa",
      totalChunks: 1,
      translated: [{ chunkId: "chunk-1", units: [] }],
      failed: [],
      skipped: [],
    };
    const fetchMock = mockWikimediaFetch(200, response);
    const provider = new WikimediaProvider("a-perseus-session-token");

    await provider.translate({
      model: "deepseek/deepseek-v4-pro",
      source: { wiki: "enwiki", pageId: 1, revisionId: 1 },
      chunk: "all",
      targetWiki: "fa",
    });

    const call = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    const headers = call[1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer a-perseus-session-token");
  });
});

describe('WikimediaTranslator — "Load an article..." error is about the loaded revision, not credentials', () => {
  const chunk: Chunk = {
    id: "chunk-1",
    units: [{ nodeId: "text-1", sourceText: "Hello" }],
  };

  it("throws when no article/revision has been loaded (source is undefined) -- regardless of the provider's credential state", async () => {
    // A WikimediaProvider with NO token at all -- if this error were
    // actually about authentication, this setup would throw the
    // provider's own "Sign in with Wikimedia" ConfigurationError
    // instead. It doesn't: WikimediaTranslator checks `source` before
    // ever calling `provider.translate(...)`.
    const provider = new WikimediaProvider(undefined);
    const translator = new WikimediaTranslator(
      provider,
      undefined,
      "fa",
      "deepseek/deepseek-v4-pro",
      new ConsoleLogger(),
    );

    await expect(translator.translateChunk(chunk)).rejects.toMatchObject({
      category: "ConfigurationError",
      message:
        "Load an article before translating with the Wikimedia provider.",
    });
  });

  it('does NOT throw the "Load an article" error once a revision source is present, even before any request is sent', async () => {
    const response: WikimediaResponse = {
      source: { wiki: "enwiki", pageId: 1, revisionId: 1 },
      targetWiki: "fa",
      totalChunks: 1,
      translated: [{ chunkId: "chunk-1", units: [] }],
      failed: [],
      skipped: [],
    };
    mockWikimediaFetch(200, response);

    const provider = new WikimediaProvider("a-perseus-session-token");
    const translator = new WikimediaTranslator(
      provider,
      { wiki: "enwiki", pageId: 1, title: "Test", revisionId: 1 },
      "fa",
      "deepseek/deepseek-v4-pro",
      new ConsoleLogger(),
    );

    await expect(translator.translateChunk(chunk)).resolves.toMatchObject({
      id: "chunk-1",
    });
  });
});
