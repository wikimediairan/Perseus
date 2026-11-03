import mysql from "mysql2/promise";
import { describe, expect, it } from "vitest";
import type { AppConfig } from "../src/config.js";
import { MariaStore } from "../src/db/mariaStore.js";
import type { SourcePage } from "../src/domain/types.js";
import { newId } from "../src/util/ids.js";

const enabled = Boolean(process.env.PERSEUS_TEST_DB_NAME);

describe.skipIf(!enabled)(
  "MariaDB claim/cancel integration (disposable migrated DB)",
  () => {
    it("fences old workers, serializes cancellation, and cascades cleanup", async () => {
      const config: AppConfig = {
        publicBaseUrl: "https://perseus.test",
        port: 8000,
        db: {
          host: process.env.PERSEUS_TEST_DB_HOST ?? "127.0.0.1",
          port: Number(process.env.PERSEUS_TEST_DB_PORT ?? 3306),
          user: process.env.PERSEUS_TEST_DB_USER ?? "root",
          password: process.env.PERSEUS_TEST_DB_PASSWORD ?? "",
          database: process.env.PERSEUS_TEST_DB_NAME ?? "",
        },
        oauth: {
          clientId: "",
          clientSecret: "",
          redirectUri: "https://perseus.test/auth/callback",
          scope: "",
        },
        openRouterApiKey: "",
        model: "google/gemini-2.5-flash",
        userAgent: "Perseus Test/0.1",
        jobRetentionHours: 24,
        jobMetadataRetentionDays: 30,
        maxArticleBytes: 2_000_000,
        maxChunks: 60,
        maxJobsPerDay: 10,
        chunkRetries: 0,
        aiRequestTimeoutMs: 120_000,
        workerPollMs: 100,
        workerLeaseSeconds: 60,
        sessionTtlDays: 30,
        oauthStateTtlMinutes: 10,
        gadgetCodeTtlSeconds: 120,
        corsExtraOrigins: [],
      };
      const firstStore = new MariaStore(config);
      const secondStore = new MariaStore(config);
      const connection = await mysql.createConnection(config.db);
      let userId: string | null = null;
      try {
        await firstStore.init();
        await secondStore.init();
        const user = await firstStore.upsertUser(newId(), "IntegrationTester");
        userId = user.id;
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
        const job = await firstStore.createJob({
          userId: user.id,
          source,
          targetWiki: "fa",
          selection: { lead: true, sections: {} },
          sections: [],
          sourceHtml: "<p>Hello.</p>",
          replaceExisting: false,
        });
        const first = await firstStore.claimNextJob("worker-a", 60);
        if (!first?.leaseOwner)
          throw new Error("First worker did not claim the job");
        expect(
          await firstStore.saveChunkPlan(job.id, first.leaseOwner, [
            {
              id: "chunk-1",
              fingerprint: "12345678",
              units: [{ nodeId: "node-1", sourceText: "Hello." }],
            },
          ]),
        ).toBe(true);
        await firstStore.updateJob(job.id, {
          leaseExpiresAt: new Date(Date.now() - 1000).toISOString(),
        });
        const second = await secondStore.claimNextJob("worker-b", 60);
        if (!second?.leaseOwner)
          throw new Error("Second worker did not reclaim the job");
        expect(second.leaseOwner).not.toBe(first.leaseOwner);
        expect(
          await firstStore.updateJob(
            job.id,
            { status: "completed" },
            first.leaseOwner,
          ),
        ).toBe(false);
        expect(
          await firstStore.markChunkTranslating(
            job.id,
            first.leaseOwner,
            "chunk-1",
          ),
        ).toBe(false);
        expect(
          await secondStore.markChunkTranslating(
            job.id,
            second.leaseOwner,
            "chunk-1",
          ),
        ).toBe(true);
        expect((await firstStore.requestCancel(job.id, user.id))?.status).toBe(
          "cancelling",
        );
        expect(
          await secondStore.updateJob(
            job.id,
            { status: "completed" },
            second.leaseOwner,
          ),
        ).toBe(false);
        expect(
          await secondStore.finishCancelledJob(job.id, second.leaseOwner),
        ).toBe(true);
        expect((await firstStore.getJob(job.id))?.status).toBe("cancelled");
      } finally {
        if (userId)
          await connection.execute("DELETE FROM users WHERE id = ?", [userId]);
        await connection.end();
        await firstStore.close();
        await secondStore.close();
      }
    });
  },
);
