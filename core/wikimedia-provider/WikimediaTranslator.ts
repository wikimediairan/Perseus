/**
 * WikimediaTranslator
 *
 * Wikimedia's own executor — NOT `LLMTranslator` pointed at a different
 * provider. It implements the same `Translator` interface Pipeline
 * already depends on (`translateChunk`/`translate`), so Pipeline, Merge,
 * chunk-progress state, and the chunk workspace UI need no changes to
 * drive it. Internally, though, it speaks `WikimediaProviderType`'s
 * whole-revision/chunk-batch protocol (see wikimedia-provider/contract.ts)
 * — nothing here renders `[[SEGMENT n]]` markers or parses a raw text
 * response the way `stages/06-translation/Translator.ts` (`LLMTranslator`)
 * does; a `WikimediaResponse`'s `translated[].units[]` already arrives in
 * exactly the `TranslatedUnit[]` shape Merge expects, so there is nothing
 * to render or parse.
 *
 * Requires the loaded article's exact revision (`ArticleRevisionSource`)
 * up front, since every Wikimedia request must identify which revision
 * and which chunk of it is being translated — a concept the text-provider
 * protocol has no equivalent for. `source` is only known once an article
 * has actually been loaded (see `createPipeline`), so it is accepted here
 * as possibly absent and checked at the point it's actually needed
 * (`translateChunk`) rather than at construction time — that is what lets
 * `createPipeline` build a Wikimedia-backed `Pipeline` for Loading before
 * any article exists, the same as it always could for a text provider.
 */

import type { TargetWikiCode } from "@core/config/targetWikis";
import { PerseusError } from "@core/platform/errors/PerseusError";
import type { Logger } from "@core/platform/logging/Logger";
import type { ArticleRevisionSource } from "@core/stages/01-input/InputLoader";
import type { Chunk } from "@core/stages/05-chunking/Chunker";
import type { TranslatedChunk } from "@core/stages/05-chunking/segmentProtocol";
import type { Translator } from "@core/stages/06-translation/Translator";
import type { WikimediaProviderType } from "@core/wikimedia-provider/contract";

export class WikimediaTranslator implements Translator {
  constructor(
    private readonly provider: WikimediaProviderType,
    private readonly source: ArticleRevisionSource | undefined,
    private readonly targetWiki: TargetWikiCode,
    private readonly model: string,
    private readonly logger?: Logger,
  ) {}

  async translateChunk(chunk: Chunk): Promise<TranslatedChunk> {
    if (!this.source) {
      throw new PerseusError(
        "ConfigurationError",
        "Load an article before translating with the Wikimedia provider.",
        { stage: "translation" },
      );
    }

    this.logger?.info(`Translating chunk ${chunk.id} via Wikimedia`, {
      units: chunk.units.length,
    });

    const response = await this.provider.translate({
      model: this.model,
      source: {
        wiki: this.source.wiki,
        pageId: this.source.pageId,
        revisionId: this.source.revisionId,
      },
      // Chunk ids are already in the `chunk-${number}` shape SizeBoundedChunker
      // assigns them (see stages/05-chunking/Chunker.ts) — the exact shape
      // WikimediaRequest.chunk expects, so no translation between id schemes
      // is needed here.
      chunk: chunk.id as `chunk-${number}`,
      targetWiki: this.targetWiki,
    });

    const failed = response.failed.find((f) => f.chunkId === chunk.id);
    if (failed) {
      throw new PerseusError(
        "TranslationError",
        `Chunk ${chunk.id} failed at the Wikimedia backend (${failed.reason}).`,
        { stage: "translation", context: { chunkId: chunk.id, reason: failed.reason } },
      );
    }

    const skipped = response.skipped.find((s) => s.chunkId === chunk.id);
    if (skipped) {
      throw new PerseusError(
        "TranslationError",
        `Chunk ${chunk.id} was skipped by the Wikimedia backend (${skipped.reason}).`,
        { stage: "translation", context: { chunkId: chunk.id, reason: skipped.reason } },
      );
    }

    const translated = response.translated.find((t) => t.chunkId === chunk.id);
    if (!translated) {
      throw new PerseusError(
        "TranslationError",
        `Chunk ${chunk.id} was not present in the Wikimedia backend's response.`,
        { stage: "translation", context: { chunkId: chunk.id } },
      );
    }

    return { id: chunk.id, units: translated.units };
  }

  /** Convenience: translates every chunk in order. Equivalent to calling `translateChunk` in a loop — same pattern `LLMTranslator.translate` uses. */
  async translate(chunks: Chunk[]): Promise<TranslatedChunk[]> {
    const results: TranslatedChunk[] = [];

    for (const chunk of chunks) {
      results.push(await this.translateChunk(chunk));
    }

    return results;
  }
}
