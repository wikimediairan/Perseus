import "./../src/runtime/dom.js";

import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../src/config.js";
import { MemoryStore } from "../src/db/memoryStore.js";
import type { SourcePage } from "../src/domain/types.js";
import { processJob } from "../src/jobs/processor.js";

const config: AppConfig = {
  publicBaseUrl: "https://perseus.test",
  port: 8000,
  db: {
    host: "localhost",
    port: 3306,
    user: "test",
    password: "",
    database: "test",
  },
  oauth: {
    clientId: "client",
    clientSecret: "secret",
    redirectUri: "https://perseus.test/auth/callback",
    scope: "",
  },
  openRouterApiKey: "test-key",
  model: "google/gemini-2.5-flash",
  userAgent: "Perseus Test/0.1",
  jobRetentionHours: 24,
  jobMetadataRetentionDays: 30,
  maxArticleBytes: 2_000_000,
  maxChunks: 60,
  maxJobsPerDay: 10,
  chunkRetries: 1,
  aiRequestTimeoutMs: 120_000,
  workerPollMs: 100,
  workerLeaseSeconds: 60,
  sessionTtlDays: 30,
  oauthStateTtlMinutes: 10,
  gadgetCodeTtlSeconds: 120,
  corsExtraOrigins: [],
};

const source: SourcePage = {
  wiki: "enwiki",
  domain: "en.wikipedia.org",
  title: "Test article",
  pageId: 42,
  revisionId: 101,
  url: "https://en.wikipedia.org/wiki/Test_article",
  namespace: 0,
  redirect: false,
  disambiguation: false,
  fetchedAt: new Date().toISOString(),
};

function mockFetch(wikitext: string) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("openrouter.ai")) {
      const body = JSON.parse(String(init?.body)) as {
        messages: { role: string; content: string }[];
      };
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: body.messages[1]?.content ?? "" } }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 10,
            total_tokens: 20,
            cost: 0.0001,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("transform/html/to/wikitext")) {
      return new Response(wikitext, { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe("job processor", () => {
  it("runs a synthetic job through translation, validation, merge, and generation", async () => {
    const store = new MemoryStore();
    const user = await store.upsertUser("42", "Tester");
    const job = await store.createJob({
      userId: user.id,
      source,
      targetWiki: "fa",
      selection: { lead: true, sections: {} },
      sections: [],
      sourceHtml: "<p>Hello world.</p>",
      replaceExisting: false,
    });

    const fetchMock = mockFetch("Hello world.\n== منابع ==\n<references />");
    vi.stubGlobal("fetch", fetchMock);

    try {
      const claimed = await store.claimNextJob("worker-test", 60);
      if (!claimed) throw new Error("Expected a claimed job");
      await processJob(store, config, claimed);
    } finally {
      vi.unstubAllGlobals();
    }

    const completed = await store.getJob(job.id);
    expect(completed?.status).toBe("completed");
    expect(completed?.progress).toBe(100);
    expect(completed?.resultWikitext).toContain("== منابع ==");
    expect(completed?.resultWikitext).not.toMatch(/⟪|\[\[PERSEUS/);

    const events = await store.listEvents(job.id, 0, 200);
    expect(events.some((event) => event.code === "JOB_COMPLETED")).toBe(true);
    expect(events.some((event) => event.code === "CHUNK_TRANSLATED")).toBe(
      true,
    );
  });

  it("does not complete when wikitext generation drops translated prose", async () => {
    const store = new MemoryStore();
    const user = await store.upsertUser("43", "Tester2");
    const job = await store.createJob({
      userId: user.id,
      source,
      targetWiki: "fa",
      selection: { lead: true, sections: {} },
      sections: [],
      sourceHtml: "<p>Hello world.</p>",
      replaceExisting: false,
    });
    vi.stubGlobal("fetch", mockFetch("== منابع ==\n<references />"));
    try {
      const claimed = await store.claimNextJob("worker-test", 60);
      if (!claimed) throw new Error("Expected a claimed job");
      await processJob(store, config, claimed);
    } finally {
      vi.unstubAllGlobals();
    }
    const failed = await store.getJob(job.id);
    expect(failed?.status).toBe("failed");
    expect(failed?.errorCode).toBe("OUTPUT_CONTENT_LOSS");
    expect(failed?.resultWikitext).toBeNull();
  });

  it("aborts an in-flight provider call when the user cancels", async () => {
    const store = new MemoryStore();
    const user = await store.upsertUser("44", "Canceller");
    const job = await store.createJob({
      userId: user.id,
      source,
      targetWiki: "fa",
      selection: { lead: true, sections: {} },
      sections: [],
      sourceHtml: "<p>Hello world.</p>",
      replaceExisting: false,
    });
    const claimed = await store.claimNextJob("worker-test", 60);
    if (!claimed) throw new Error("Expected a claimed job");
    let providerStarted = false;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        if (!String(input).includes("openrouter.ai"))
          throw new Error(`Unexpected fetch ${input}`);
        providerStarted = true;
        void store.requestCancel(job.id, user.id);
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new Error("cancelled")),
            { once: true },
          );
        });
      }),
    );
    try {
      await processJob(store, { ...config, aiRequestTimeoutMs: 5000 }, claimed);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(providerStarted).toBe(true);
    expect((await store.getJob(job.id))?.status).toBe("cancelled");
  });

  it("stores a safe provider error without upstream content", async () => {
    const store = new MemoryStore();
    const user = await store.upsertUser("45", "ErrorTester");
    const job = await store.createJob({
      userId: user.id,
      source,
      targetWiki: "fa",
      selection: { lead: true, sections: {} },
      sections: [],
      sourceHtml: "<p>Hello world.</p>",
      replaceExisting: false,
    });
    const claimed = await store.claimNextJob("worker-test", 60);
    if (!claimed) throw new Error("Expected a claimed job");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        if (String(input).includes("openrouter.ai")) {
          return new Response(
            JSON.stringify({ error: { message: "secret article content" } }),
            { status: 429 },
          );
        }
        throw new Error(`Unexpected fetch ${input}`);
      }),
    );
    try {
      await processJob(store, { ...config, chunkRetries: 0 }, claimed);
    } finally {
      vi.unstubAllGlobals();
    }
    expect((await store.getJob(job.id))?.status).toBe("failed");
    const stored = JSON.stringify({
      job: await store.getJob(job.id),
      chunks: await store.getChunks(job.id),
      events: await store.listEvents(job.id, 0, 100),
    });
    expect(stored).not.toContain("secret article content");
  });
});
