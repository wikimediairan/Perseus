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
 */

import type { PerseusConfig } from "@core/config/Config";
import { getTargetWiki } from "@core/config/targetWikis";
import { Pipeline } from "@core/pipeline/Pipeline";
import { PerseusError } from "@core/platform/errors/PerseusError";
import type { Logger } from "@core/platform/logging/Logger";
import { ConsoleLogger } from "@core/platform/logging/Logger";
import { WikipediaInputLoader } from "@core/stages/01-input/InputLoader";
import { WikipediaParsoidParser } from "@core/stages/02-parsing/ParsoidParser";
import { WikidataLinkResolver } from "@core/stages/03-link-resolution/WikidataLinkResolver";
import { WikipediaExtractor } from "@core/stages/04-extraction/Extractor";
import { SizeBoundedChunker } from "@core/stages/05-chunking/Chunker";
import { DefaultPromptManager } from "@core/stages/06-translation/PromptManager";
import { createProvider, isWikimediaProvider } from "@core/stages/06-translation/ProviderFactory";
import { LLMTranslator } from "@core/stages/06-translation/Translator";
import { DomMerger } from "@core/stages/07-merge/Merger";
import { HeuristicReferenceAttentionClassifier } from "@core/stages/08-reference-attention/ReferenceAttention";
import { WikipediaWikitextGenerator } from "@core/stages/09-generation/WikitextGenerator";

export function createPipeline(
  config: PerseusConfig,
  logger: Logger = new ConsoleLogger(),
): Pipeline {
  const provider = createProvider(config.activeProvider);

  // Wikimedia has its own chunk-level translation contract (see
  // WikimediaProviderType) and isn't driven through LLMTranslator's
  // text protocol — the built-in pipeline doesn't have a Wikimedia
  // executor yet, so fail clearly here instead of producing an
  // invalid Pipeline.
  if (isWikimediaProvider(provider)) {
    throw new PerseusError(
      "ConfigurationError",
      "The Wikimedia provider is not yet supported by the built-in translation pipeline.",
      { stage: "llm-translation" },
    );
  }

  const promptManager = new DefaultPromptManager();
  const targetWiki = getTargetWiki(config.targetWiki);

  return new Pipeline({
    logger,
    inputLoader: new WikipediaInputLoader(),
    parser: new WikipediaParsoidParser(logger.forStage("parse-with-parsoid")),
    linkResolver: new WikidataLinkResolver(targetWiki, logger.forStage("resolve-wikidata-links")),
    extractor: new WikipediaExtractor(),
    chunker: new SizeBoundedChunker(),
    translator: new LLMTranslator(
      provider,
      promptManager,
      targetWiki,
      logger.forStage("llm-translation"),
      config.prompt.userPrompt,
    ),
    merger: new DomMerger(logger.forStage("merge")),
    generator: new WikipediaWikitextGenerator(),
    referenceAttention: new HeuristicReferenceAttentionClassifier(),
    targetWiki: config.targetWiki,
  });
}
