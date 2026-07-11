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


import { SizeBoundedChunker } from '@core/chunker/Chunker';
import type { PerseusConfig } from '@core/config/Config';
import { getTargetWiki } from '@core/config/targetWikis';
import { WikipediaExtractor } from '@core/extractor/Extractor';
import { WikipediaWikitextGenerator } from '@core/generator/WikitextGenerator';
import { WikipediaInputLoader } from '@core/input/InputLoader';
import { WikidataLinkResolver } from '@core/linkResolver/WikidataLinkResolver';
import { createProvider } from '@core/llm/ProviderFactory';
import { ConsoleLogger } from '@core/logging/Logger';
import type { Logger } from '@core/logging/Logger';
import { DomMerger } from '@core/merge/Merger';
import { WikipediaParsoidParser } from '@core/parser/ParsoidParser';
import { Pipeline } from '@core/pipeline/Pipeline';
import { DefaultPromptManager } from '@core/prompt/PromptManager';
import { HeuristicReferenceAttentionClassifier } from '@core/referenceAttention/ReferenceAttention';
import { LLMTranslator } from '@core/translator/Translator';

export function createPipeline(
  config: PerseusConfig,
  logger: Logger = new ConsoleLogger(),
): Pipeline {
  const provider = createProvider(config.activeProvider);
  const promptManager = new DefaultPromptManager();
  const targetWiki = getTargetWiki(config.targetWiki);

  return new Pipeline({
    logger,
    inputLoader: new WikipediaInputLoader(),
    parser: new WikipediaParsoidParser(logger.forStage('parse-with-parsoid')),
    linkResolver: new WikidataLinkResolver(
      targetWiki,
      logger.forStage('resolve-wikidata-links'),
    ),
    extractor: new WikipediaExtractor(),
    chunker: new SizeBoundedChunker(),
    translator: new LLMTranslator(
      provider,
      promptManager,
      targetWiki,
      logger.forStage('llm-translation'),
      config.prompt.userPrompt,
    ),
    merger: new DomMerger(logger.forStage('merge')),
    generator: new WikipediaWikitextGenerator(),
    referenceAttention: new HeuristicReferenceAttentionClassifier(),
    targetWiki: config.targetWiki,
  });
}
