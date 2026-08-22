/**
 * handleTranslateRequest.ts
 *
 * Backend orchestration: HTTP-shaped request in, HTTP-shaped result
 * out. All Perseus domain/business logic (fetching + parsing the
 * article, chunking, translating, provider selection) is delegated to
 * `@perseus/core`'s Pipeline — this file's only remaining
 * responsibilities are backend concerns: resolving which chunk(s) the
 * caller asked for, gating each chunk on the caller's quota, and
 * recording usage/cost as chunks complete.
 */
import type {
  ArticleRevisionSource,
  Chunk,
  TargetWikiCode,
  TranslatedUnit,
} from "@perseus/core";
import {
  createPipeline,
  isTargetWikiCode,
  PerseusError,
  SOURCE_WIKI_CODE,
  TARGET_WIKIS,
} from "@perseus/core";
import type { Env } from "@/config/env";
import { getQuotaStatus, recordQuotaUsage } from "@/repositories/quota";
import type { UserRow } from "@/repositories/usersRepo";
import type { Logger } from "@/shared/logger";
import { resolveModel } from "@/translation/model";
import { withDomEnvironment } from "@/wikimedia/domEnvironment";
import { fetchRevisionTitle } from "@/wikimedia/fetchRevisionMeta";

export interface ArticleSourceRef {
  wiki: string;
  pageId: number;
  revisionId: number;
}

export interface TranslateRequestInput {
  source: ArticleSourceRef;
  chunk: string;
  targetWiki: string;
  model: string;
}

interface TranslatedChunkOut {
  chunkId: string;
  units: TranslatedUnit[];
}

interface FailedChunkOut {
  chunkId: string;
  reason: "provider_error";
}

interface SkippedChunkOut {
  chunkId: string;
  reason: "quota_exhausted";
}

export interface TranslateResult {
  source: ArticleSourceRef;
  targetWiki: string;
  totalChunks: number;
  translated: TranslatedChunkOut[];
  failed: FailedChunkOut[];
  skipped: SkippedChunkOut[];
}

function resolveChunkPlan(chunks: Chunk[], requestedChunk: string): Chunk[] {
  if (requestedChunk === "all") {
    return chunks;
  }

  const match = chunks.find((c) => c.id === requestedChunk);

  if (!match) {
    throw new PerseusError(
      "InputError",
      `Unknown chunk id "${requestedChunk}".`,
      { stage: "chunking", context: { notFound: true } },
    );
  }

  return [match];
}

function resolveTargetWiki(targetWiki: string): TargetWikiCode {
  if (!isTargetWikiCode(targetWiki)) {
    throw new PerseusError(
      "InputError",
      `Unsupported targetWiki "${targetWiki}". Supported values: ${Object.keys(TARGET_WIKIS).join(", ")}.`,
      { stage: "translation" },
    );
  }
  return targetWiki;
}

export async function handleTranslateRequest(
  env: Env,
  logger: Logger,
  user: UserRow,
  input: TranslateRequestInput,
): Promise<TranslateResult> {
  if (input.source.wiki !== SOURCE_WIKI_CODE) {
    throw new PerseusError(
      "InputError",
      `Unsupported source wiki "${input.source.wiki}". Perseus only translates from ${SOURCE_WIKI_CODE}.`,
      { stage: "load-article" },
    );
  }

  const targetWikiCode = resolveTargetWiki(input.targetWiki);
  const model = resolveModel(input.model);

  const pipeline = createPipeline(
    {
      activeProvider: {
        kind: "openrouter",
        model,
        apiKey: env.OPENROUTER_API_KEY,
      },
      prompt: { userPrompt: undefined },
      targetWiki: targetWikiCode,
    },
    logger,
  );

  const { chunks, source: revisionSource } = await withDomEnvironment(
    async () => {
      const title = await fetchRevisionTitle(
        input.source.revisionId,
        input.source.pageId,
      );
      const source: ArticleRevisionSource = {
        wiki: input.source.wiki,
        pageId: input.source.pageId,
        title,
        revisionId: input.source.revisionId,
      };

      const extraction = await pipeline.reconstructFromRevision(
        source,
        targetWikiCode,
      );
      const chunks = await pipeline.deriveChunks(extraction.worklist);

      return { chunks, source: extraction.source };
    },
  );

  const plan = resolveChunkPlan(chunks, input.chunk);

  const translated: TranslatedChunkOut[] = [];
  const failed: FailedChunkOut[] = [];
  const skipped: SkippedChunkOut[] = [];

  for (const chunk of plan) {
    const status = await getQuotaStatus(env.DB, user.id, user.weeklyCredit);

    if (status.remainingCost <= 0) {
      skipped.push({ chunkId: chunk.id, reason: "quota_exhausted" });
      logger.info("Chunk skipped: quota exhausted", { chunkId: chunk.id });
      continue;
    }

    try {
      const result = await pipeline.translateChunk(chunk);
      translated.push({ chunkId: result.id, units: result.units });

      if (result.usage && typeof result.usage.cost === "number") {
        await recordQuotaUsage(env.DB, user.id, result.usage.cost);
      } else if (result.usage) {
        // Token usage came back, but no cost — expected for a provider
        // like 9Router, which reports tokens but never cost on its
        // chat-completions response (see chatProtocol.ts). Core
        // correctly leaves `cost` undefined rather than inventing one,
        // so quota simply isn't decremented for this chunk: exact
        // monetary accounting isn't possible without a per-model
        // pricing table, which Perseus doesn't currently have. This is
        // an expected limitation of the current provider, not an
        // error — log at info, not error.
        logger.info(
          "Provider reported token usage but no cost; quota not decremented for this chunk",
          { chunkId: chunk.id, usage: result.usage },
        );
      } else {
        logger.warn(
          "Provider response had no usage at all; quota not incremented for this chunk",
          { chunkId: chunk.id },
        );
      }
    } catch (err) {
      if (err instanceof PerseusError && err.category === "ProviderError") {
        failed.push({ chunkId: chunk.id, reason: "provider_error" });
        logger.warn("Chunk translation failed (provider error)", {
          chunkId: chunk.id,
          stage: err.stage,
        });
        continue;
      }
      throw err;
    }
  }

  return {
    source: {
      wiki: revisionSource.wiki,
      pageId: revisionSource.pageId,
      revisionId: revisionSource.revisionId,
    },
    targetWiki: targetWikiCode,
    totalChunks: chunks.length,
    translated,
    failed,
    skipped,
  };
}
