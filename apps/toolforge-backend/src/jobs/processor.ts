import { type Chunk, computeChunkFingerprint } from "@perseus/core";
import type { AppConfig } from "../config.js";
import type { Store } from "../db/store.js";
import type {
  ChunkPlan,
  ChunkRecord,
  JobRecord,
  TranslatedChunkRecord,
} from "../domain/types.js";
import {
  assemble,
  createTranslator,
  prepareSelectedArticle,
  translate,
} from "../perseus/flow.js";
import {
  validateFinalWikitext,
  validateTranslatedChunk,
} from "../perseus/validate.js";
import { ApiError, isApiError } from "../util/errors.js";
import { JobLogger } from "../util/jobLogger.js";
import { addHours } from "../util/time.js";
import { domainFromWiki } from "../wikimedia/client.js";

const MAX_EVENT_MESSAGE = 1000;

class ClaimLost extends Error {}

function requireClaim(written: boolean): void {
  if (!written) throw new ClaimLost("The worker no longer owns this job.");
}

class LeaseKeeper {
  private timer: NodeJS.Timeout | null = null;
  lost = false;

  constructor(
    private readonly store: Store,
    private readonly jobId: string,
    private readonly workerId: string,
    private readonly leaseSeconds: number,
    private readonly onLost: () => void,
  ) {}

  start(): void {
    const intervalMs = Math.max(
      1500,
      Math.floor((this.leaseSeconds * 1000) / 3),
    );
    this.timer = setInterval(() => {
      void this.store
        .renewLease(this.jobId, this.workerId, this.leaseSeconds)
        .then((ok) => {
          if (!ok) {
            this.lost = true;
            this.onLost();
          }
        })
        .catch(() => {
          this.lost = true;
          this.onLost();
        });
    }, intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

function errorMessage(error: unknown): string {
  if (isApiError(error)) return error.message;
  const category = (error as { category?: string } | null)?.category;
  if (category === "ProviderError")
    return "The AI provider request failed or timed out.";
  if (category === "GenerationError") return "Wikitext generation failed.";
  if (category === "TranslationError")
    return "The translation response could not be accepted.";
  if (category === "MergeError")
    return "Translated content could not be merged.";
  return "Translation processing failed. Please retry or contact the maintainer.";
}

function isRetryable(error: unknown): boolean {
  if (isApiError(error)) {
    if (
      error.code === "MODEL_NOT_ALLOWED" ||
      error.code === "PROVIDER_CONFIGURATION_ERROR" ||
      error.code === "JOB_STALE"
    ) {
      return false;
    }
    return true;
  }

  const category = (error as { category?: string } | null)?.category;
  if (category === "ConfigurationError" || category === "InputError") {
    return false;
  }
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uniqueWarnings(warnings: string[]): string[] {
  return [...new Set(warnings.filter(Boolean))].slice(0, 50);
}

function chunkPlan(chunks: Chunk[]): ChunkPlan[] {
  return chunks.map((chunk) => ({
    id: chunk.id,
    units: chunk.units.map((unit) => ({
      nodeId: unit.nodeId,
      sourceText: unit.sourceText,
    })),
    fingerprint: computeChunkFingerprint(chunk),
  }));
}

function samePlan(stored: ChunkRecord[], planned: ChunkPlan[]): boolean {
  if (stored.length !== planned.length) return false;
  for (const [i, left] of stored.entries()) {
    const right = planned[i];
    if (
      !right ||
      left.chunkId !== right.id ||
      left.fingerprint !== right.fingerprint ||
      left.ordinal !== i
    ) {
      return false;
    }
  }
  return true;
}

function toCoreChunk(plan: ChunkPlan): Chunk {
  return {
    id: plan.id,
    units: plan.units.map((unit) => ({
      nodeId: unit.nodeId,
      sourceText: unit.sourceText,
    })),
  };
}

function translatedRecord(
  chunk: Chunk,
  translated: {
    units: {
      nodeId: string;
      sourceText: string;
      translatedText: string;
    }[];
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      cost?: number;
    };
  },
): TranslatedChunkRecord {
  return {
    id: chunk.id,
    units: translated.units,
    usage: translated.usage,
  };
}

async function isCancellationRequested(
  store: Store,
  job: JobRecord,
): Promise<boolean> {
  const latest = await store.getJobSummary(job.id);
  return Boolean(
    !latest ||
      latest.cancelRequestedAt ||
      latest.status === "cancelling" ||
      latest.status === "cancelled",
  );
}

async function cancelJob(
  store: Store,
  job: JobRecord,
  claimOwner: string,
  logger: JobLogger,
): Promise<void> {
  const finished = await store.finishCancelledJob(job.id, claimOwner);
  if (finished) logger.info("Job cancelled by the user");
  await logger.flush();
}

export async function processJob(
  store: Store,
  config: AppConfig,
  job: JobRecord,
): Promise<void> {
  const claimOwner = job.leaseOwner;
  if (!claimOwner) {
    throw new Error("A job must be claimed before processing.");
  }
  const logger = new JobLogger(async (level, code, message, data) => {
    await store.appendEvent(
      job.id,
      level,
      code,
      message.slice(0, MAX_EVENT_MESSAGE),
      data ?? null,
    );
  });
  const abortController = new AbortController();
  const keeper = new LeaseKeeper(
    store,
    job.id,
    claimOwner,
    config.workerLeaseSeconds,
    () => abortController.abort(),
  );
  keeper.start();
  let checkingCancellation = false;
  const cancellationTimer = setInterval(() => {
    if (checkingCancellation || abortController.signal.aborted) return;
    checkingCancellation = true;
    void isCancellationRequested(store, job)
      .then((requested) => {
        if (requested) abortController.abort();
      })
      .catch(() => undefined)
      .finally(() => {
        checkingCancellation = false;
      });
  }, 1000);
  cancellationTimer.unref();

  try {
    if (await isCancellationRequested(store, job)) {
      await cancelJob(store, job, claimOwner, logger);
      return;
    }

    if (!job.sourceHtml) {
      throw new ApiError(
        409,
        "SOURCE_UNAVAILABLE",
        "The source snapshot for this job is no longer available.",
      );
    }

    await store.appendEvent(
      job.id,
      "info",
      "JOB_STARTED",
      "Preparing the selected article.",
    );
    requireClaim(
      await store.updateJob(
        job.id,
        { stage: "parsing", progress: 2 },
        claimOwner,
      ),
    );

    const prepared = await prepareSelectedArticle(
      config,
      job.sourceHtml,
      job.sourceTitle,
      domainFromWiki(job.sourceWiki),
      job.targetWiki,
      job.selection,
      logger.forStage("parse-with-parsoid"),
    );

    const planned = chunkPlan(prepared.chunks);
    const stored = await store.getChunks(job.id);

    if (stored.length === 0) {
      requireClaim(await store.saveChunkPlan(job.id, claimOwner, planned));
    } else if (!samePlan(stored, planned)) {
      throw new ApiError(
        409,
        "JOB_STALE",
        "The article structure changed since this job was created. Start a new translation job.",
      );
    }

    const chunks = prepared.chunks;
    const current = await store.getChunks(job.id);
    const totalChunks = chunks.length;
    const totalUnits = chunks.reduce(
      (sum, chunk) => sum + chunk.units.length,
      0,
    );

    requireClaim(
      await store.updateJob(
        job.id,
        {
          stage: "translating",
          progress: 5,
          totalChunks,
          totalUnits,
          completedChunks: 0,
          failedChunks: 0,
        },
        claimOwner,
      ),
    );

    const translator = createTranslator(
      config,
      job.targetWiki,
      logger.forStage("translation"),
    );

    const maxAttempts = config.chunkRetries + 1;

    for (let index = 0; index < chunks.length; index++) {
      if (keeper.lost) return;
      if (await isCancellationRequested(store, job)) {
        await cancelJob(store, job, claimOwner, logger);
        return;
      }

      const chunk = chunks[index];
      const plannedChunk = planned[index];
      if (!chunk || !plannedChunk) {
        throw new ApiError(
          409,
          "CHUNK_PLAN_MISMATCH",
          `Chunk ${index + 1} is missing from the in-memory plan.`,
        );
      }
      const existing = current.find((item) => item.chunkId === chunk.id);
      if (!existing) {
        throw new ApiError(
          409,
          "CHUNK_PLAN_MISMATCH",
          `Chunk ${chunk.id} is missing from the persisted plan.`,
        );
      }
      if (existing.status === "translated") continue;

      let lastError: unknown = null;
      let saved = false;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (keeper.lost) return;
        if (await isCancellationRequested(store, job)) {
          await cancelJob(store, job, claimOwner, logger);
          return;
        }

        try {
          requireClaim(
            await store.markChunkTranslating(job.id, claimOwner, chunk.id),
          );
          const result = await translate(
            translator,
            toCoreChunk(plannedChunk),
            {
              signal: abortController.signal,
              timeoutMs: config.aiRequestTimeoutMs,
            },
          );
          const record = translatedRecord(chunk, result);
          validateTranslatedChunk(plannedChunk, record);
          requireClaim(
            await store.saveChunkTranslation(
              job.id,
              claimOwner,
              chunk.id,
              record,
              attempt,
            ),
          );
          await store.appendEvent(
            job.id,
            "info",
            "CHUNK_TRANSLATED",
            `Chunk ${index + 1} of ${totalChunks} translated.`,
            { chunkId: chunk.id, attempt },
          );
          saved = true;
          break;
        } catch (error) {
          if (error instanceof ClaimLost) throw error;
          if (keeper.lost || abortController.signal.aborted) {
            if (await isCancellationRequested(store, job)) {
              await cancelJob(store, job, claimOwner, logger);
            }
            return;
          }
          lastError = error;
          const retryable = isRetryable(error);
          const willRetry = retryable && attempt < maxAttempts;

          if (willRetry) {
            await store.appendEvent(
              job.id,
              "warn",
              "CHUNK_RETRY",
              `Chunk ${index + 1} failed; retrying.`,
              {
                chunkId: chunk.id,
                attempt,
                error: errorMessage(error).slice(0, 300),
              },
            );
            await sleep(Math.min(8000, 500 * 2 ** (attempt - 1)));
            continue;
          }

          requireClaim(
            await store.markChunkFailed(
              job.id,
              claimOwner,
              chunk.id,
              errorMessage(error),
              attempt,
            ),
          );
          await store.appendEvent(
            job.id,
            "error",
            "CHUNK_FAILED",
            `Chunk ${index + 1} failed after ${attempt} attempt(s).`,
            {
              chunkId: chunk.id,
              error: errorMessage(error).slice(0, 300),
              retryable,
            },
          );
          break;
        }
      }

      if (!saved && !lastError) {
        requireClaim(
          await store.markChunkFailed(
            job.id,
            claimOwner,
            chunk.id,
            "Unknown translation failure",
            maxAttempts,
          ),
        );
      }

      const refreshed = await store.getChunks(job.id);
      const completed = refreshed.filter(
        (item) => item.status === "translated",
      ).length;
      const failed = refreshed.filter(
        (item) => item.status === "failed",
      ).length;
      const translatedUnits = refreshed
        .filter((item) => item.status === "translated")
        .reduce((sum, item) => sum + (item.translated?.length ?? 0), 0);

      requireClaim(
        await store.updateJob(
          job.id,
          {
            completedChunks: completed,
            failedChunks: failed,
            translatedUnits,
            progress:
              totalChunks === 0
                ? 5
                : Math.round(5 + (90 * (completed + failed)) / totalChunks),
          },
          claimOwner,
        ),
      );
    }

    if (keeper.lost) return;
    if (await isCancellationRequested(store, job)) {
      await cancelJob(store, job, claimOwner, logger);
      return;
    }

    const finalChunks = await store.getChunks(job.id);
    const failedChunks = finalChunks.filter((item) => item.status === "failed");
    const completedChunks = finalChunks.filter(
      (item) => item.status === "translated",
    ).length;

    if (failedChunks.length > 0) {
      const message = `${failedChunks.length} chunk(s) failed. Use retry to process only the failed chunks.`;
      requireClaim(
        await store.updateJob(
          job.id,
          {
            status: "failed",
            stage: "failed",
            progress: Math.min(
              95,
              Math.round(
                5 +
                  (90 * (completedChunks + failedChunks.length)) / totalChunks,
              ),
            ),
            errorCode: "CHUNKS_FAILED",
            errorMessage: message,
            completedAt: new Date().toISOString(),
            expiresAt: addHours(
              new Date(),
              config.jobRetentionHours,
            ).toISOString(),
            leaseOwner: null,
            leaseExpiresAt: null,
            warnings: uniqueWarnings([
              ...prepared.warnings,
              ...logger.warnings,
              ...(job.warnings ?? []),
            ]),
          },
          claimOwner,
        ),
      );
      await store.appendEvent(job.id, "error", "JOB_FAILED", message);
      await logger.flush();
      return;
    }

    requireClaim(
      await store.updateJob(
        job.id,
        { stage: "generating", progress: 97 },
        claimOwner,
      ),
    );
    await store.appendEvent(
      job.id,
      "info",
      "GENERATING",
      "All chunks translated; generating wikitext.",
    );

    const translations = finalChunks
      .filter(
        (item) => item.status === "translated" && item.translated !== null,
      )
      .map((item) => ({
        id: item.chunkId,
        units: item.translated ?? [],
        usage: item.usage ?? undefined,
      }));

    const wikitext = validateFinalWikitext(
      await assemble(
        prepared.ir,
        chunks,
        translations,
        job.targetWiki,
        logger.forStage("generate-wikitext"),
        prepared.needsReferencesList,
      ),
      translations,
    );

    const completedAt = new Date();
    const expiresAt = addHours(completedAt, config.jobRetentionHours);
    const warnings = uniqueWarnings([
      ...prepared.warnings,
      ...logger.warnings,
      ...(job.warnings ?? []),
    ]);

    requireClaim(
      await store.updateJob(
        job.id,
        {
          status: "completed",
          stage: "completed",
          progress: 100,
          resultWikitext: wikitext,
          resultMeta: {
            model: config.model,
            targetWiki: job.targetWiki,
            source: {
              wiki: job.sourceWiki,
              title: job.sourceTitle,
              revisionId: job.sourceRevisionId,
              url: job.sourceUrl,
            },
            totalChunks,
            totalUnits,
            completedAt: completedAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
          },
          warnings,
          errorCode: null,
          errorMessage: null,
          completedAt: completedAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
          sourceHtml: null,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
        claimOwner,
      ),
    );
    await store.appendEvent(
      job.id,
      "info",
      "JOB_COMPLETED",
      "Wikitext is ready. The human review step is outside Perseus.",
    );
    await logger.flush();
  } catch (error) {
    if (keeper.lost || error instanceof ClaimLost) {
      await cancelJob(store, job, claimOwner, logger);
      return;
    }
    if (await isCancellationRequested(store, job)) {
      await cancelJob(store, job, claimOwner, logger);
      return;
    }

    const message = errorMessage(error).slice(0, 1000);
    const code = isApiError(error) ? error.code : "JOB_FAILED";
    const failed = await store.updateJob(
      job.id,
      {
        status: "failed",
        stage: "failed",
        errorCode: code,
        errorMessage: message,
        completedAt: new Date().toISOString(),
        expiresAt: addHours(new Date(), config.jobRetentionHours).toISOString(),
        leaseOwner: null,
        leaseExpiresAt: null,
        warnings: uniqueWarnings([...(job.warnings ?? [])]),
      },
      claimOwner,
    );
    if (!failed) {
      await cancelJob(store, job, claimOwner, logger);
      return;
    }
    await store.appendEvent(job.id, "error", code, message);
    await logger.flush();
  } finally {
    clearInterval(cancellationTimer);
    keeper.stop();
  }
}
