import { describe, expect, it } from "vitest";
import { MemoryStore } from "../src/db/memoryStore.js";
import type { ChunkPlan, SourcePage } from "../src/domain/types.js";

const source: SourcePage = {
  wiki: "enwiki",
  domain: "en.wikipedia.org",
  title: "Lease test",
  pageId: 11,
  revisionId: 22,
  url: "https://en.wikipedia.org/wiki/Lease_test",
  namespace: 0,
  redirect: false,
  disambiguation: false,
  fetchedAt: new Date().toISOString(),
};

const chunk: ChunkPlan = {
  id: "chunk-1",
  fingerprint: "fingerprint",
  units: [{ nodeId: "node-1", sourceText: "Hello." }],
};

async function fixture() {
  const store = new MemoryStore();
  const user = await store.upsertUser("11", "LeaseTester");
  const job = await store.createJob({
    userId: user.id,
    source,
    targetWiki: "fa",
    selection: { lead: true, sections: {} },
    sections: [],
    sourceHtml: "<p>Hello.</p>",
    replaceExisting: false,
  });
  return { store, user, job };
}

describe("claim fencing and cancellation", () => {
  it("blocks every stale claim write after a replacement worker claims the job", async () => {
    const { store, job } = await fixture();
    const first = await store.claimNextJob("worker-a", 60);
    if (!first?.leaseOwner) throw new Error("Missing first claim");
    expect(await store.saveChunkPlan(job.id, first.leaseOwner, [chunk])).toBe(
      true,
    );
    expect(
      await store.markChunkTranslating(job.id, first.leaseOwner, chunk.id),
    ).toBe(true);

    // Simulate lease expiry before another worker takes over.
    expect(
      await store.updateJob(job.id, {
        leaseExpiresAt: new Date(Date.now() - 1000).toISOString(),
      }),
    ).toBe(true);
    const second = await store.claimNextJob("worker-b", 60);
    if (!second?.leaseOwner) throw new Error("Missing replacement claim");
    expect(second.leaseOwner).not.toBe(first.leaseOwner);

    expect(
      await store.updateJob(job.id, { status: "completed" }, first.leaseOwner),
    ).toBe(false);
    expect(await store.saveChunkPlan(job.id, first.leaseOwner, [chunk])).toBe(
      false,
    );
    expect(
      await store.markChunkTranslating(job.id, first.leaseOwner, chunk.id),
    ).toBe(false);
    expect(
      await store.saveChunkTranslation(
        job.id,
        first.leaseOwner,
        chunk.id,
        {
          id: chunk.id,
          units: [
            { nodeId: "node-1", sourceText: "Hello.", translatedText: "سلام." },
          ],
        },
        1,
      ),
    ).toBe(false);
    expect(
      await store.markChunkFailed(
        job.id,
        first.leaseOwner,
        chunk.id,
        "error",
        1,
      ),
    ).toBe(false);
    expect((await store.getJob(job.id))?.status).toBe("running");
  });

  it("prevents claim after queued cancellation", async () => {
    const { store, user, job } = await fixture();
    expect((await store.requestCancel(job.id, user.id))?.status).toBe(
      "cancelled",
    );
    expect(await store.claimNextJob("worker", 60)).toBeNull();
  });

  it("prevents completion after running cancellation and lets the owner finish it", async () => {
    const { store, user, job } = await fixture();
    const claimed = await store.claimNextJob("worker", 60);
    if (!claimed?.leaseOwner) throw new Error("Missing claim");
    expect((await store.requestCancel(job.id, user.id))?.status).toBe(
      "cancelling",
    );
    expect(
      await store.updateJob(
        job.id,
        { status: "completed" },
        claimed.leaseOwner,
      ),
    ).toBe(false);
    expect(await store.finishCancelledJob(job.id, claimed.leaseOwner)).toBe(
      true,
    );
    expect((await store.getJob(job.id))?.status).toBe("cancelled");
    expect(await store.finishCancelledJob(job.id, claimed.leaseOwner)).toBe(
      false,
    );
  });
});
