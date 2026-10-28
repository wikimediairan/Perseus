import type { PerseusConfig } from "../config/Config.js";
import { getTargetWiki } from "../config/targetWikis.js";
import type { Logger } from "../platform/logging/Logger.js";
import { ConsoleLogger } from "../platform/logging/Logger.js";
import type { ArticleRevisionSource } from "../stages/01-input/InputLoader.js";
import { WikipediaInputLoader } from "../stages/01-input/InputLoader.js";
import { WikipediaParsoidParser } from "../stages/02-parsing/ParsoidParser.js";
import { WikidataLinkResolver } from "../stages/03-link-resolution/WikidataLinkResolver.js";
import { WikipediaExtractor } from "../stages/04-extraction/Extractor.js";
import { SizeBoundedChunker } from "../stages/05-chunking/Chunker.js";
import { DefaultPromptManager } from "../stages/06-translation/PromptManager.js";
import { createProvider } from "../stages/06-translation/ProviderFactory.js";
import type { Translator } from "../stages/06-translation/Translator.js";
import { LLMTranslator } from "../stages/06-translation/Translator.js";
import { DomMerger } from "../stages/07-merge/Merger.js";
import { HeuristicReferenceAttentionClassifier } from "../stages/08-reference-attention/ReferenceAttention.js";
import { WikipediaWikitextGenerator } from "../stages/09-generation/WikitextGenerator.js";
import { isWikimediaProvider } from "../wikimedia-provider/WikimediaProvider.js";
import { WikimediaTranslator } from "../wikimedia-provider/WikimediaTranslator.js";
import { Pipeline } from "./Pipeline.js";

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
