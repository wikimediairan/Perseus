import { describe, expect, it, vi } from "vitest";
import { issueGadgetCode } from "../src/auth/gadgetCode.js";
import type { AppConfig } from "../src/config.js";
import { MemoryStore } from "../src/db/memoryStore.js";
import type { SourcePage } from "../src/domain/types.js";
import { createApp } from "../src/http/app.js";
import { sha256 } from "../src/util/ids.js";

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
  openRouterApiKey: "test",
  model: "google/gemini-2.5-flash",
  userAgent: "Perseus Test/0.1",
  jobRetentionHours: 24,
  jobMetadataRetentionDays: 30,
  maxArticleBytes: 2_000_000,
  maxChunks: 60,
  maxJobsPerDay: 10,
  chunkRetries: 2,
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
  title: "Bibimbap",
  pageId: 42,
  revisionId: 101,
  url: "https://en.wikipedia.org/wiki/Bibimbap",
  namespace: 0,
  redirect: false,
  disambiguation: false,
  fetchedAt: new Date().toISOString(),
};

async function fixture() {
  const store = new MemoryStore();
  const user = await store.upsertUser("42", "Tester");
  const token = "ps_test-token";
  await store.createSession(
    user.id,
    sha256(token),
    new Date(Date.now() + 3600_000),
  );
  const app = createApp({ store, config });
  return { store, user, token, app };
}

function bearer(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Origin: "https://en.wikipedia.org",
  };
}

describe("API auth and ownership", () => {
  it("serves health without auth", async () => {
    const { app } = await fixture();
    const response = await app.request("/v1/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
  });

  it("rejects unauthenticated API calls", async () => {
    const { app } = await fixture();
    const response = await app.request("/v1/me");
    expect(response.status).toBe(401);
  });

  it("answers CORS preflight without a bearer token", async () => {
    const { app } = await fixture();
    const response = await app.request("/v1/jobs", {
      method: "OPTIONS",
      headers: {
        Origin: "https://en.wikipedia.org",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://en.wikipedia.org",
    );
  });

  it("returns the current user and active job", async () => {
    const { app, token } = await fixture();
    const response = await app.request("/v1/me", {
      headers: bearer(token),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      user: { username: string };
      activeJob: unknown;
    };
    expect(body.user.username).toBe("Tester");
    expect(body.activeJob).toBeNull();
  });

  it("exchanges a one-time gadget code for a bearer session", async () => {
    const { app, store, user } = await fixture();
    const issued = await issueGadgetCode(
      store,
      user.id,
      "https://en.wikipedia.org",
      120,
    );

    const response = await app.request("/auth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://en.wikipedia.org",
      },
      body: JSON.stringify({ code: issued.code }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { token: string };
    expect(body.token).toMatch(/^ps_/);

    const me = await app.request("/v1/me", {
      headers: bearer(body.token),
    });
    expect(me.status).toBe(200);
  });

  it("rejects a gadget code from another origin", async () => {
    const { app, store, user } = await fixture();
    const issued = await issueGadgetCode(
      store,
      user.id,
      "https://de.wikipedia.org",
      120,
    );

    const response = await app.request("/auth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://en.wikipedia.org",
      },
      body: JSON.stringify({ code: issued.code }),
    });
    expect(response.status).toBe(401);
  });

  it("requires an Origin when exchanging a gadget code", async () => {
    const { app, store, user } = await fixture();
    const issued = await issueGadgetCode(
      store,
      user.id,
      "https://en.wikipedia.org",
      120,
    );
    const response = await app.request("/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: issued.code }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "ORIGIN_REQUIRED" },
    });
  });
});

describe("job API", () => {
  it("rejects a stale section ID before normalizing selection", async () => {
    const { app, token } = await fixture();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("/w/api.php")) {
          return new Response(
            JSON.stringify({
              query: {
                pages: [
                  {
                    pageid: 42,
                    ns: 0,
                    title: "Bibimbap",
                    lastrevid: 101,
                  },
                ],
              },
            }),
            { status: 200 },
          );
        }
        if (url.includes("/revision/101/html")) {
          return new Response(
            "<html><body><p>Article text.</p></body></html>",
            { status: 200 },
          );
        }
        throw new Error(`Unexpected fetch ${url}`);
      }),
    );
    try {
      const response = await app.request("/v1/jobs", {
        method: "POST",
        headers: { ...bearer(token), "Content-Type": "application/json" },
        body: JSON.stringify({
          source: { wiki: "enwiki", title: "Bibimbap", revisionId: 101 },
          targetWiki: "fa",
          selection: {
            lead: true,
            sections: { stale_section: { selected: true, ownText: true } },
          },
        }),
      });
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        error: { code: "SELECTION_MISMATCH" },
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("lets an owner read and cancel a queued job", async () => {
    const { app, store, user, token } = await fixture();
    const job = await store.createJob({
      userId: user.id,
      source,
      targetWiki: "fa",
      selection: { lead: true, sections: {} },
      sections: [],
      sourceHtml: "<p>Hello</p>",
      replaceExisting: false,
    });

    const read = await app.request(`/v1/jobs/${job.id}`, {
      headers: bearer(token),
    });
    expect(read.status).toBe(200);
    const readBody = (await read.json()) as {
      job: { status: string; outputAvailable: boolean };
    };
    expect(readBody.job.status).toBe("queued");
    expect(readBody.job.outputAvailable).toBe(false);

    const cancel = await app.request(`/v1/jobs/${job.id}/cancel`, {
      method: "POST",
      headers: bearer(token),
    });
    expect(cancel.status).toBe(202);
    const cancelBody = (await cancel.json()) as { job: { status: string } };
    expect(cancelBody.job.status).toBe("cancelled");
  });

  it("does not expose another user's job", async () => {
    const { app, store, token } = await fixture();
    const other = await store.upsertUser("99", "Other");
    const job = await store.createJob({
      userId: other.id,
      source,
      targetWiki: "fa",
      selection: { lead: true, sections: {} },
      sections: [],
      sourceHtml: "<p>Hello</p>",
      replaceExisting: false,
    });

    const response = await app.request(`/v1/jobs/${job.id}`, {
      headers: bearer(token),
    });
    expect(response.status).toBe(404);
  });

  it("refuses a second active job", async () => {
    const { store, user } = await fixture();
    await store.createJob({
      userId: user.id,
      source,
      targetWiki: "fa",
      selection: { lead: true, sections: {} },
      sections: [],
      sourceHtml: "<p>Hello</p>",
      replaceExisting: false,
    });

    await expect(
      store.createJob({
        userId: user.id,
        source,
        targetWiki: "fa",
        selection: { lead: true, sections: {} },
        sections: [],
        sourceHtml: "<p>Hello</p>",
        replaceExisting: false,
      }),
    ).rejects.toMatchObject({ code: "ACTIVE_JOB_EXISTS" });
  });

  it("returns 409 for an output that is not ready", async () => {
    const { app, store, user, token } = await fixture();
    const job = await store.createJob({
      userId: user.id,
      source,
      targetWiki: "fa",
      selection: { lead: true, sections: {} },
      sections: [],
      sourceHtml: "<p>Hello</p>",
      replaceExisting: false,
    });

    const response = await app.request(`/v1/jobs/${job.id}/output`, {
      headers: bearer(token),
    });
    expect(response.status).toBe(409);
  });
});
