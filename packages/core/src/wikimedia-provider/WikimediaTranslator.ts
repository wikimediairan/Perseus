import type { TargetWikiCode } from "../config/targetWikis";
import { PerseusError } from "../platform/errors/PerseusError";
import type { Logger } from "../platform/logging/Logger";
import type { ArticleRevisionSource } from "../stages/01-input/InputLoader";
import type { Chunk } from "../stages/05-chunking/Chunker";
import type { TranslatedChunk } from "../stages/05-chunking/segmentProtocol";
import type { Translator } from "../stages/06-translation/Translator";
import type { WikimediaProviderType } from "./contract";

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

      chunk: chunk.id as `chunk-${number}`,
      targetWiki: this.targetWiki,
    });

    const failed = response.failed.find((f) => f.chunkId === chunk.id);
    if (failed) {
      throw new PerseusError(
        "TranslationError",
        `Chunk ${chunk.id} failed at the Wikimedia backend (${failed.reason}).`,
        {
          stage: "translation",
          context: { chunkId: chunk.id, reason: failed.reason },
        },
      );
    }

    const skipped = response.skipped.find((s) => s.chunkId === chunk.id);
    if (skipped) {
      throw new PerseusError(
        "TranslationError",
        `Chunk ${chunk.id} was skipped by the Wikimedia backend (${skipped.reason}).`,
        {
          stage: "translation",
          context: { chunkId: chunk.id, reason: skipped.reason },
        },
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

  async translate(chunks: Chunk[]): Promise<TranslatedChunk[]> {
    const results: TranslatedChunk[] = [];

    for (const chunk of chunks) {
      results.push(await this.translateChunk(chunk));
    }

    return results;
  }
}
