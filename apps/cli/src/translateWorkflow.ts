/**
 * translateWorkflow
 *
 * Drives Core's Pipeline chunk-by-chunk (Pipeline.deriveChunks /
 * translateChunk / mergeChunk / applySessionChunk — see
 * ../pipeline/Pipeline.ts) for both a brand-new translation and a
 * resumed one, sharing one code path so resuming isn't a special case
 * bolted on afterwards.
 *
 * Resumability (requirement 11): a chunk already fully translated in a
 * loaded session is detected via `Pipeline.applySessionChunk`'s own
 * `appliedCount` — if every unit in that chunk already has a
 * translation different from the freshly reconstructed original, the
 * chunk is skipped rather than re-sent to OpenRouter. This reuses
 * Core's existing diff rule (translation-sessions/import.ts) rather
 * than inventing a parallel "chunk status" concept.
 *
 * The session is regenerated from the live IR via Core's own
 * `exportTranslationSession` after every chunk (translated OR skipped)
 * and written to disk immediately — an interrupted run can always be
 * resumed from the last successfully written session file.
 */

import type {
  Chunk,
  ExtractionResult,
  Logger,
  Pipeline,
  TranslationSession,
} from "@perseus/core";
import {
  DEFAULT_MAX_CHUNK_CHARS,
  exportTranslationSession,
} from "@perseus/core";
import { slugify, writeOutputs, writeSessionOnly } from "./fileOutput";

interface ChunkFailure {
  chunkId: string;
  message: string;
}

export interface TranslateWorkflowResult {
  sourceTitle: string;
  targetWiki: string;
  totalChunks: number;
  translatedChunks: number;
  skippedAlreadyTranslatedChunks: number;
  failedChunks: ChunkFailure[];
  wikitextPath: string;
  sessionPath: string;
}

export async function runTranslateWorkflow(params: {
  pipeline: Pipeline;
  extraction: ExtractionResult;
  /** An already-loaded, validated session to resume from — omit to start fresh. */
  existingSession?: TranslationSession;
  outputDir: string;
  logger: Logger;
}): Promise<TranslateWorkflowResult> {
  const { pipeline, extraction, existingSession, outputDir, logger } = params;

  const chunks: Chunk[] = await pipeline.deriveChunks(extraction.worklist);
  const baseName = slugify(extraction.source.title);

  let ir = extraction.ir;
  let translatedCount = 0;
  let skippedCount = 0;
  const failedChunks: ChunkFailure[] = [];

  logger.info(`Derived ${chunks.length} chunk(s) to translate`, {
    chunks: chunks.length,
  });

  for (const chunk of chunks) {
    const priorSessionChunk = existingSession?.chunks.find(
      (c) => c.id === chunk.id,
    );

    if (priorSessionChunk) {
      const applied = await pipeline.applySessionChunk(ir, priorSessionChunk);
      ir = applied.ir;

      if (
        applied.appliedCount >= chunk.units.length &&
        chunk.units.length > 0
      ) {
        logger.info(`Chunk ${chunk.id} already fully translated — skipping`, {
          chunkId: chunk.id,
        });
        skippedCount++;
        continue;
      }
    }

    try {
      logger.info(`Translating chunk ${chunk.id}`, {
        chunkId: chunk.id,
        units: chunk.units.length,
      });
      const translated = await pipeline.translateChunk(chunk);
      ir = await pipeline.mergeChunk(ir, translated);
      translatedCount++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Chunk ${chunk.id} failed to translate`, {
        chunkId: chunk.id,
        error: message,
      });
      failedChunks.push({ chunkId: chunk.id, message });
    }

    // Incremental save after every chunk (success or failure) so an
    // interrupted/killed run can resume without losing prior progress.
    const partialSession = exportTranslationSession(
      { ...extraction, ir },
      chunks,
      DEFAULT_MAX_CHUNK_CHARS,
    );
    await writeSessionOnly(outputDir, baseName, partialSession);
  }

  await pipeline.classifyReferenceAttention(ir);
  const wikitext = await pipeline.generateWikitext(ir);

  const finalSession = exportTranslationSession(
    { ...extraction, ir },
    chunks,
    DEFAULT_MAX_CHUNK_CHARS,
  );
  const { wikitextPath, sessionPath } = await writeOutputs(
    outputDir,
    baseName,
    wikitext,
    finalSession,
  );

  return {
    sourceTitle: extraction.source.title,
    targetWiki: extraction.targetWiki,
    totalChunks: chunks.length,
    translatedChunks: translatedCount,
    skippedAlreadyTranslatedChunks: skippedCount,
    failedChunks,
    wikitextPath,
    sessionPath,
  };
}
