/**
 * createPipeline
 *
 * Composition root: the one place that wires concrete implementations
 * together into a runnable Pipeline. The Phase 2 scaffold flagged this
 * as missing ("nothing yet assembles a concrete Pipeline instance");
 * Phase 3 adds it now that the stages it wires are real.
 *
 * Kept intentionally as a single factory function rather than a DI
 * container/framework, per the fixed architecture's "manual dependency
 * injection" principle.
 *
 * Translator selection: `LLMTranslator` and `WikimediaTranslator` both
 * implement the same `Translator` interface Pipeline depends on, so
 * choosing between them is a plain branch here — nothing in `Pipeline`
 * itself needs to know which one it was handed (see
 * wikimedia-provider/WikimediaTranslator.ts for why Wikimedia gets its
 * own executor instead of being driven through `LLMTranslator`).
 *
 * `source` is optional and only used to build a `WikimediaTranslator`
 * (see its own file for why): the very first `createPipeline` call for a
 * new load happens before any article exists, so this is deliberately
 * NOT required here — passing it late (once `runToExtraction` has
 * returned) is the caller's job, same as it already re-creates a
 * `Pipeline` per action today.
 */

import type { PerseusConfig } from "@core/config/Config";
import { getTargetWiki } from "@core/config/targetWikis";
import { Pipeline } from "@core/pipeline/Pipeline";
import type { Logger } from "@core/platform/logging/Logger";
import { ConsoleLogger } from "@core/platform/logging/Logger";
import type { ArticleRevisionSource } from "@core/stages/01-input/InputLoader";
import { WikipediaInputLoader } from "@core/stages/01-input/InputLoader";
import { WikipediaParsoidParser } from "@core/stages/02-parsing/ParsoidParser";
import { WikidataLinkResolver } from "@core/stages/03-link-resolution/WikidataLinkResolver";
import { WikipediaExtractor } from "@core/stages/04-extraction/Extractor";
import { SizeBoundedChunker } from "@core/stages/05-chunking/Chunker";
import { DefaultPromptManager } from "@core/stages/06-translation/PromptManager";
import { createProvider, isWikimediaProvider } from "@core/stages/06-translation/ProviderFactory";
import type { Translator } from "@core/stages/06-translation/Translator";
import { LLMTranslator } from "@core/stages/06-translation/Translator";
import { DomMerger } from "@core/stages/07-merge/Merger";
import { HeuristicReferenceAttentionClassifier } from "@core/stages/08-reference-attention/ReferenceAttention";
import { WikipediaWikitextGenerator } from "@core/stages/09-generation/WikitextGenerator";
import { WikimediaTranslator } from "@core/wikimedia-provider/WikimediaTranslator";

export function createPipeline(
  config: PerseusConfig,
  logger: Logger = new ConsoleLogger(),
  source?: ArticleRevisionSource,
): Pipeline {
  const provider = createProvider(config.activeProvider);
  const targetWiki = getTargetWiki(config.targetWiki);
  const translationLogger = logger.forStage("translation");

  const translator: Translator = isWikimediaProvider(provider)
    ? new WikimediaTranslator(
        provider,
        source,
        config.targetWiki,
        config.activeProvider.model,
        translationLogger,
      )
    : new LLMTranslator(
        provider,
        new DefaultPromptManager(),
        targetWiki,
        translationLogger,
        config.prompt.userPrompt,
      );

  return new Pipeline({
    logger,
    inputLoader: new WikipediaInputLoader(),
    parser: new WikipediaParsoidParser(logger.forStage("parse-with-parsoid")),
    linkResolver: new WikidataLinkResolver(targetWiki, logger.forStage("resolve-wikidata-links")),
    extractor: new WikipediaExtractor(),
    chunker: new SizeBoundedChunker(),
    translator,
    merger: new DomMerger(logger.forStage("merge")),
    generator: new WikipediaWikitextGenerator(),
    referenceAttention: new HeuristicReferenceAttentionClassifier(),
    targetWiki: config.targetWiki,
  });
}
