import "./runtime/dom.js";

import { loadConfig } from "./config.js";
import { MariaStore } from "./db/mariaStore.js";
import { processJob } from "./jobs/processor.js";
import { newWorkerId } from "./util/ids.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const store = new MariaStore(config);
  await store.init();

  const workerId = newWorkerId();
  let stopping = false;
  let lastExpirySweep = 0;
  let lastPurge = 0;

  const shutdown = (signal: string): void => {
    console.log(`[perseus-worker] received ${signal}; finishing current job`);
    stopping = true;
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  console.log(`[perseus-worker] started as ${workerId}`);

  while (!stopping) {
    const now = Date.now();

    if (now - lastExpirySweep > 10 * 60_000) {
      lastExpirySweep = now;
      try {
        const expired = await store.expireJobs(new Date());
        if (expired > 0) {
          console.log(`[perseus-worker] expired ${expired} job(s)`);
        }
      } catch (error) {
        console.error("[perseus-worker] expiry sweep failed", error);
      }
    }

    if (now - lastPurge > 60 * 60_000) {
      lastPurge = now;
      try {
        const purged = await store.purgeExpiredPayloads(new Date());
        const cutoff = new Date(
          Date.now() - config.jobMetadataRetentionDays * 86_400_000,
        );
        const removed = await store.purgeOldJobs(cutoff);
        if (purged > 0) {
          console.log(`[perseus-worker] purged ${purged} chunk row(s)`);
        }
        if (removed > 0) {
          console.log(`[perseus-worker] purged ${removed} old job(s)`);
        }
      } catch (error) {
        console.error("[perseus-worker] payload purge failed", error);
      }
    }

    try {
      const job = await store.claimNextJob(workerId, config.workerLeaseSeconds);
      if (!job) {
        await new Promise((resolve) =>
          setTimeout(resolve, config.workerPollMs),
        );
        continue;
      }

      console.log(`[perseus-worker] claimed job ${job.id}`);
      await processJob(store, config, job);
      console.log(`[perseus-worker] finished job ${job.id}`);
    } catch (error) {
      console.error("[perseus-worker] job loop error", error);
      await new Promise((resolve) => setTimeout(resolve, config.workerPollMs));
    }
  }

  await store.close();
  console.log("[perseus-worker] stopped");
}

main().catch((error) => {
  console.error("[perseus-worker] fatal", error);
  process.exitCode = 1;
});
