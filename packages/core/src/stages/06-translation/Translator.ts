import type { TargetWikiDefinition } from "../../config/targetWikis";
import { PerseusError } from "../../platform/errors/PerseusError";
import type { Logger } from "../../platform/logging/Logger";
import type { Chunk } from "../05-chunking/Chunker";
import type {
  TranslatedChunk,
  TranslatedUnit,
} from "../05-chunking/segmentProtocol";
import {
  parseChunkTranslation,
  renderChunkForTranslation,
} from "../05-chunking/segmentProtocol";
import type { TextProviderType, TranslationUsage } from "./LLMProvider";
import type { PromptManager } from "./PromptManager";

export type { TranslatedChunk } from "../05-chunking/segmentProtocol";

export interface Translator {
  translateChunk(chunk: Chunk): Promise<TranslatedChunk>;

  translate(chunks: Chunk[]): Promise<TranslatedChunk[]>;
}

function sumUsage(
  entries: (TranslationUsage | undefined)[],
): TranslationUsage | undefined {
  const present = entries.filter((u): u is TranslationUsage => u !== undefined);
  if (present.length === 0) return undefined;

  const allHaveCost =
    present.length === entries.length &&
    present.every((u) => typeof u.cost === "number");

  return {
    promptTokens: present.reduce((sum, u) => sum + u.promptTokens, 0),
    completionTokens: present.reduce((sum, u) => sum + u.completionTokens, 0),
    totalTokens: present.reduce((sum, u) => sum + u.totalTokens, 0),
    ...(allHaveCost
      ? { cost: present.reduce((sum, u) => sum + (u.cost ?? 0), 0) }
      : {}),
  };
}

export class LLMTranslator implements Translator {
  constructor(
    private readonly provider: TextProviderType,
    private readonly promptManager: PromptManager,
    private readonly targetWiki: TargetWikiDefinition,
    private readonly logger: Logger,
    private readonly userPrompt?: string,
  ) {}

  async translateChunk(chunk: Chunk): Promise<TranslatedChunk> {
    const systemPrompt = `${this.promptManager.buildPrompt(this.targetWiki, this.userPrompt)}`;

    this.logger.info(`Translating chunk ${chunk.id}`, {
      units: chunk.units.length,
    });

    const usageEntries: (TranslationUsage | undefined)[] = [];

    let units: TranslatedUnit[];
    let missingUnitIds: string[];

    {
      const segmented = await this.provider.translate({
        systemPrompt,
        sourceText: renderChunkForTranslation(chunk),
        targetLanguage: this.targetWiki.code,
      });
      usageEntries.push(segmented.usage);

      try {
        ({ units, missingUnitIds } = parseChunkTranslation(
          chunk,
          segmented.translatedText,
        ));
      } catch (error) {
        if (
          !(
            error instanceof PerseusError &&
            error.category === "ChunkIdentityError"
          )
        ) {
          throw error;
        }

        this.logger.warn(
          `Chunk ${chunk.id}: response was missing/mismatched its chunk identity marker; retrying once`,
        );

        const retried = await this.provider.translate({
          systemPrompt,
          sourceText: renderChunkForTranslation(chunk),
          targetLanguage: this.targetWiki.code,
        });
        usageEntries.push(retried.usage);

        ({ units, missingUnitIds } = parseChunkTranslation(
          chunk,
          retried.translatedText,
        ));
      }
    }

    if (missingUnitIds.length > 0) {
      this.logger.warn(
        `Chunk ${chunk.id}: ${missingUnitIds.length} segment(s) missing or failed marker validation in the model's response; retranslating individually`,
      );

      for (const nodeId of missingUnitIds) {
        const unit = chunk.units.find((u) => u.nodeId === nodeId);

        if (!unit) throw Error("unit is null");

        const single = await this.provider.translate({
          systemPrompt: this.promptManager.buildPrompt(
            this.targetWiki,
            this.userPrompt,
          ),
          sourceText: unit.sourceText,
          targetLanguage: this.targetWiki.code,
        });
        usageEntries.push(single.usage);
        units.push({
          nodeId: unit.nodeId,
          sourceText: unit.sourceText,
          translatedText: single.translatedText.trim(),
        });
      }
    }

    if (units.length !== chunk.units.length) {
      throw new PerseusError(
        "TranslationError",
        `Chunk ${chunk.id} could not be fully translated.`,
        { stage: "translation", context: { chunkId: chunk.id } },
      );
    }

    units.sort(
      (a, b) =>
        chunk.units.findIndex((u) => u.nodeId === a.nodeId) -
        chunk.units.findIndex((u) => u.nodeId === b.nodeId),
    );

    return { id: chunk.id, units, usage: sumUsage(usageEntries) };
  }

  async translate(chunks: Chunk[]): Promise<TranslatedChunk[]> {
    const results: TranslatedChunk[] = [];

    for (const chunk of chunks) {
      results.push(await this.translateChunk(chunk));
    }

    return results;
  }
}
