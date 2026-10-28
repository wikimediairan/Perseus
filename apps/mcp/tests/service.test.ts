import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateTranslationSession } from "@perseus/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TranslationService } from "../src/service.js";
import { defaultDataDir, SessionStore } from "../src/store.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function temporaryRoot() {
  const root = await mkdtemp(join(tmpdir(), "perseus-mcp-test-"));
  temporaryRoots.push(root);
  return root;
}

function required<T>(value: T | null): T {
  if (value === null) throw new Error("Expected a translation chunk");
  return value;
}

function mockWikimedia(html = "<p>Hello world.</p>") {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/w/rest.php/v1/page/"))
      return new Response(
        JSON.stringify({
          source: "Hello world.",
          title: "Example",
          id: 42,
          latest: { id: 101 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    if (url.includes("/w/rest.php/v1/revision/101/html"))
      return new Response(`<html><body>${html}</body></html>`, { status: 200 });
    if (url.includes("/transform/html/to/wikitext/"))
      return new Response("Translated wikitext", { status: 200 });
    throw new Error(`Unexpected Wikimedia request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function createdService(html?: string) {
  mockWikimedia(html);
  const root = await temporaryRoot();
  const service = new TranslationService(new SessionStore(root));
  const created = await service.create(
    "https://en.wikipedia.org/wiki/Example",
    "fa",
  );
  return { root, service, created };
}

describe("translation sessions", () => {
  it("creates a session from mocked Wikimedia responses and persists its source snapshot", async () => {
    const { root, created } = await createdService();
    const saved = JSON.parse(
      await readFile(join(root, created.sessionId, "session.json"), "utf8"),
    );

    expect(created).toMatchObject({
      source: { wiki: "enwiki", pageId: 42, revisionId: 101, title: "Example" },
      chunkCount: 1,
    });
    expect(saved.snapshot).toMatchObject({
      html: "<p>Hello world.</p>",
      rawWikitext: "Hello world.",
    });
  });

  it("selects the next unfinished chunk deterministically in source order", async () => {
    const html = `<p>${"First sentence. ".repeat(400)}</p><p>${"Second sentence. ".repeat(400)}</p>`;
    const { service, created } = await createdService(html);
    const first = await service.chunk(created.sessionId);
    expect(first.chunk?.chunkId).toBe("chunk-1");
    const firstChunk = required(first.chunk);
    await service.submit(
      created.sessionId,
      firstChunk.chunkId,
      firstChunk.sourceContent,
      firstChunk.version,
    );
    const second = await service.chunk(created.sessionId);
    expect(second.chunk?.chunkId).toBe("chunk-2");
  });

  it("accepts valid content, rejects damaged structure, and makes retries idempotent", async () => {
    const { service, created } = await createdService();
    const chunk = required((await service.chunk(created.sessionId)).chunk);
    const invalid = await service.submit(
      created.sessionId,
      chunk.chunkId,
      chunk.sourceContent.replace("[[SEGMENT 1]]", ""),
      chunk.version,
    );
    expect(invalid).toMatchObject({ accepted: false, version: 0 });
    expect(invalid.validationProblems[0]).toContain("SEGMENT");

    const accepted = await service.submit(
      created.sessionId,
      chunk.chunkId,
      chunk.sourceContent,
      chunk.version,
    );
    expect(accepted).toMatchObject({
      accepted: true,
      idempotent: false,
      version: 1,
    });
    await expect(
      service.submit(
        created.sessionId,
        chunk.chunkId,
        chunk.sourceContent,
        chunk.version,
      ),
    ).resolves.toMatchObject({ accepted: true, idempotent: true, version: 1 });
  });

  it("requires explicit replacement and rejects stale accepted-translation updates", async () => {
    const { service, created } = await createdService();
    const chunk = required((await service.chunk(created.sessionId)).chunk);
    await service.submit(
      created.sessionId,
      chunk.chunkId,
      chunk.sourceContent,
      0,
    );
    const replacement = chunk.sourceContent.replace(
      "Hello world.",
      "سلام دنیا.",
    );

    await expect(
      service.submit(created.sessionId, chunk.chunkId, replacement, 1),
    ).rejects.toMatchObject({ code: "REPLACEMENT_REQUIRED" });
    await expect(
      service.submit(created.sessionId, chunk.chunkId, replacement, 0, true),
    ).rejects.toMatchObject({ code: "STALE_VERSION" });
    await expect(
      service.submit(created.sessionId, chunk.chunkId, replacement, 1, true),
    ).resolves.toMatchObject({ accepted: true, version: 2 });
    expect(
      (await service.chunk(created.sessionId, chunk.chunkId)).chunk,
    ).toMatchObject({ currentTranslation: replacement, version: 2 });
  });

  it("rejects incomplete export and creates a complete Desktop-compatible export", async () => {
    const { service, created } = await createdService();
    await expect(service.export(created.sessionId)).rejects.toMatchObject({
      code: "INCOMPLETE_TRANSLATION",
    });
    const chunk = required((await service.chunk(created.sessionId)).chunk);
    await service.submit(
      created.sessionId,
      chunk.chunkId,
      chunk.sourceContent,
      chunk.version,
    );
    const exported = await service.export(created.sessionId);
    const desktop = JSON.parse(await readFile(exported.sessionFile, "utf8"));
    expect(() => validateTranslationSession(desktop)).not.toThrow();
    expect(await readFile(exported.wikitextFile, "utf8")).toContain(
      "Translated wikitext",
    );
    expect(exported.progress.exportReady).toBe(true);
  });

  it("persists across a service restart", async () => {
    const { root, created } = await createdService();
    const restarted = new TranslationService(new SessionStore(root));
    await expect(restarted.status(created.sessionId)).resolves.toMatchObject({
      sessionId: created.sessionId,
      progress: { total: 1, completed: 0 },
    });
  });

  it("rejects concurrent writers while a session is locked", async () => {
    const { service, created } = await createdService();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const first = service.store.locked(created.sessionId, async () => {
      entered();
      await held;
    });
    await ready;
    await expect(
      service.store.locked(created.sessionId, async () => undefined),
    ).rejects.toMatchObject({ code: "SESSION_BUSY" });
    release();
    await first;
  });
});

describe("storage boundaries", () => {
  it("computes documented Linux, macOS, and Windows defaults", () => {
    expect(defaultDataDir({}, "linux", "/home/alice")).toBe(
      "/home/alice/.local/share/perseus/mcp",
    );
    expect(
      defaultDataDir({ XDG_DATA_HOME: "/data" }, "linux", "/home/alice"),
    ).toBe("/data/perseus/mcp");
    expect(defaultDataDir({}, "darwin", "/Users/alice")).toBe(
      "/Users/alice/Library/Application Support/Perseus/mcp",
    );
    expect(
      defaultDataDir(
        { LOCALAPPDATA: "C:\\Users\\Alice\\AppData\\Local" },
        "win32",
        "C:\\Users\\Alice",
      ),
    ).toBe("C:\\Users\\Alice\\AppData\\Local\\Perseus\\mcp");
  });

  it("requires absolute data roots and rejects invalid IDs and traversal", async () => {
    expect(() => new SessionStore("relative/path")).toThrowError(
      expect.objectContaining({ code: "INVALID_DATA_DIR" }),
    );
    const store = new SessionStore(await temporaryRoot());
    for (const id of ["not-a-session", "../outside", "../../etc/passwd"]) {
      expect(() => store.directory(id)).toThrowError(
        expect.objectContaining({ code: "INVALID_SESSION_ID" }),
      );
    }
  });
});
