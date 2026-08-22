import type { PerseusConfig } from "../config/Config";
import { getTargetWiki } from "../config/targetWikis";
import type { Logger } from "../platform/logging/Logger";
import { ConsoleLogger } from "../platform/logging/Logger";
import type { ArticleRevisionSource } from "../stages/01-input/InputLoader";
import { WikipediaInputLoader } from "../stages/01-input/InputLoader";
import { WikipediaParsoidParser } from "../stages/02-parsing/ParsoidParser";
import { WikidataLinkResolver } from "../stages/03-link-resolution/WikidataLinkResolver";
import { WikipediaExtractor } from "../stages/04-extraction/Extractor";
import { SizeBoundedChunker } from "../stages/05-chunking/Chunker";
import { DefaultPromptManager } from "../stages/06-translation/PromptManager";
import { createProvider } from "../stages/06-translation/ProviderFactory";
import type { Translator } from "../stages/06-translation/Translator";
import { LLMTranslator } from "../stages/06-translation/Translator";
import { DomMerger } from "../stages/07-merge/Merger";
import { HeuristicReferenceAttentionClassifier } from "../stages/08-reference-attention/ReferenceAttention";
import { WikipediaWikitextGenerator } from "../stages/09-generation/WikitextGenerator";
import { isWikimediaProvider } from "../wikimedia-provider/WikimediaProvider";
import { WikimediaTranslator } from "../wikimedia-provider/WikimediaTranslator";
import { Pipeline } from "./Pipeline";

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
