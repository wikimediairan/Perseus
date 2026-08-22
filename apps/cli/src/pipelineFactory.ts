import type { Logger, PerseusConfig } from "@perseus/core";
import {
  createProvider,
  DefaultPromptManager,
  DomMerger,
  getTargetWiki,
  HeuristicReferenceAttentionClassifier,
  LLMTranslator,
  Pipeline,
  SizeBoundedChunker,
  WikidataLinkResolver,
  WikipediaExtractor,
  WikipediaInputLoader,
  WikipediaParsoidParser,
  WikipediaWikitextGenerator,
} from "@perseus/core";
import { RetryingProvider, type RetryOptions } from "./retryingProvider";
import { SanitizingProvider } from "./sanitizingProvider";

/**
 * Same wiring as `../pipeline/createPipeline`, plus a retry decorator
 * around the OpenRouter provider (see retryingProvider.ts) — everything
 * else is exactly Core's real implementation, reused as-is.
 */
export function createCliPipeline(
  config: PerseusConfig,
  logger: Logger,
  retryOptions?: RetryOptions,
): Pipeline {
  const baseProvider = createProvider(config.activeProvider);
  const provider = new RetryingProvider(
    new SanitizingProvider(baseProvider),
    retryOptions,
  );
  const targetWiki = getTargetWiki(config.targetWiki);
  const translationLogger = logger.forStage("translation");

  const translator = new LLMTranslator(
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
    linkResolver: new WikidataLinkResolver(
      targetWiki,
      logger.forStage("resolve-wikidata-links"),
    ),
    extractor: new WikipediaExtractor(),
    chunker: new SizeBoundedChunker(),
    translator,
    merger: new DomMerger(logger.forStage("merge")),
    generator: new WikipediaWikitextGenerator(),
    referenceAttention: new HeuristicReferenceAttentionClassifier(),
    targetWiki: config.targetWiki,
  });
}
