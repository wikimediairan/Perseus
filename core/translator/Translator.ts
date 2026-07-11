/**
 * Translator
 *
 * Real implementation. Submits each Chunk to the configured LLMProvider
 * and collects translated results (Software Specification, LLM
 * Translation). Owns none of the provider-specific logic (Provider
 * Abstraction) — it only orchestrates calls against the LLMProvider
 * interface.
 *
 * This is now one of TWO executors over the exact same Chunk objects —
 * see core/chunker/segmentProtocol.ts. `translateChunk` renders and
 * parses a chunk using the identical functions a human pasting into an
 * external AI goes through; the only thing specific to this class is
 * that the request/response round trip happens over HTTP against
 * `LLMProvider` instead of a clipboard.
 *
 * If the model drops a segment marker (Risk R-3 — translation quality is
 * bounded by the underlying model), this falls back to a single,
 * individual request for just the missing unit(s) rather than failing
 * the whole chunk.
 */

import type { Chunk } from '@core/chunker/Chunker';
import type { TranslatedChunk } from '@core/chunker/segmentProtocol';
import {
  renderChunkForTranslation,
  parseChunkTranslation,
  SEGMENT_FORMAT_INSTRUCTIONS,
} from '@core/chunker/segmentProtocol';
import type { TargetWikiDefinition } from '@core/config/targetWikis';
import { PerseusError } from '@core/errors/PerseusError';
import type { LLMProvider } from '@core/llm/LLMProvider';
import type { Logger } from '@core/logging/Logger';
import type { PromptManager } from '@core/prompt/PromptManager';

// Re-exported from their new home (core/chunker/segmentProtocol.ts) so existing
// importers (Merger, core/index.ts) don't need to change their import path.
export type { TranslatedUnit, TranslatedChunk } from '@core/chunker/segmentProtocol';

export interface Translator {
  /** Translates a single chunk — the shared primitive both this class and `translate()` below build on. */
  translateChunk(chunk: Chunk): Promise<TranslatedChunk>,
  /** Convenience: translates every chunk in order. Equivalent to calling `translateChunk` in a loop. */
  translate(chunks: Chunk[]): Promise<TranslatedChunk[]>,
}

export class LLMTranslator implements Translator {
  constructor(
    private readonly provider: LLMProvider,
    private readonly promptManager: PromptManager,
    private readonly targetWiki: TargetWikiDefinition,
    private readonly logger: Logger,
    private readonly userPrompt?: string,
  ) {}

  async translateChunk(chunk: Chunk): Promise<TranslatedChunk> {
    const systemPrompt = `${this.promptManager.buildPrompt(this.targetWiki, this.userPrompt)}\n\n${SEGMENT_FORMAT_INSTRUCTIONS}`;

    this.logger.info(`Translating chunk ${chunk.id}`, { units: chunk.units.length });

    const segmented = await this.provider.translate({
      systemPrompt,
      sourceText: renderChunkForTranslation(chunk),
      targetLanguage: this.targetWiki.code,
    });

    const { units, missingUnitIds } = parseChunkTranslation(chunk, segmented.translatedText);

    if (missingUnitIds.length > 0) {
      this.logger.warn(
        `Chunk ${chunk.id}: ${missingUnitIds.length} segment(s) missing from the model's response; retranslating individually`,
      );

      for (const nodeId of missingUnitIds) {
        const unit = chunk.units.find((u) => u.nodeId === nodeId)!;
        const single = await this.provider.translate({
          systemPrompt: this.promptManager.buildPrompt(this.targetWiki, this.userPrompt),
          sourceText: unit.sourceText,
          targetLanguage: this.targetWiki.code,
        });
        units.push({
          nodeId: unit.nodeId,
          sourceText: unit.sourceText,
          translatedText: single.translatedText.trim(),
        });
      }
    }

    if (units.length !== chunk.units.length) {
      throw new PerseusError(
        'TranslationError',
        `Chunk ${chunk.id} could not be fully translated.`,
        { stage: 'llm-translation', context: { chunkId: chunk.id } },
      );
    }

    // Restore original unit order (missing/retried units were appended out of order above).
    units.sort(
      (a, b) => chunk.units.findIndex((u) => u.nodeId === a.nodeId) - chunk.units.findIndex((u) => u.nodeId === b.nodeId),
    );

    return { id: chunk.id, units };
  }

  async translate(chunks: Chunk[]): Promise<TranslatedChunk[]> {
    const results: TranslatedChunk[] = [];

    for (const chunk of chunks) {
      results.push(await this.translateChunk(chunk));
    }

    return results;
  }
}
