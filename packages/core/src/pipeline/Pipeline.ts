import type { TargetWikiCode } from "../config/targetWikis.js";
import { getTargetWiki } from "../config/targetWikis.js";
import { wikipediaDomainFromWiki } from "../config/wikipedia.js";
import type { IntermediateRepresentation } from "../ir/IntermediateRepresentation.js";
import type { Logger } from "../platform/logging/Logger.js";
import type {
  ArticleRevisionSource,
  ArticleSource,
  InputLoader,
} from "../stages/01-input/InputLoader.js";
import type { Parser } from "../stages/02-parsing/ParsoidParser.js";
import {
  buildIRFromParsoidHtml,
  fetchRevisionHtml,
} from "../stages/02-parsing/ParsoidParser.js";
import type { LinkResolver } from "../stages/03-link-resolution/WikidataLinkResolver.js";
import type {
  Extractor,
  TranslationWorklist,
} from "../stages/04-extraction/Extractor.js";
import type { Chunk, Chunker } from "../stages/05-chunking/Chunker.js";
import type { TranslatedChunk } from "../stages/05-chunking/segmentProtocol.js";
import type { Translator } from "../stages/06-translation/Translator.js";
import type { Merger } from "../stages/07-merge/Merger.js";
import type { ReferenceAttentionClassifier } from "../stages/08-reference-attention/ReferenceAttention.js";
import type { WikitextGenerator } from "../stages/09-generation/WikitextGenerator.js";
import { applySessionChunk } from "../translation-sessions/import.js";
import { calculateSessionProgress } from "../translation-sessions/progress.js";
import type {
  ApplySessionChunkResult,
  SessionProgress,
  TranslationSession,
} from "../translation-sessions/types.js";

export type { PipelineStageName } from "./PipelineStage.js";
export { PIPELINE_STAGE_ORDER } from "./PipelineStage.js";

export interface PipelineDependencies {
  logger: Logger;
  inputLoader: InputLoader;
  parser: Parser;
  linkResolver: LinkResolver;
  extractor: Extractor;
  chunker: Chunker;
  translator: Translator;
  merger: Merger;
  generator: WikitextGenerator;
  referenceAttention: ReferenceAttentionClassifier;

  targetWiki: TargetWikiCode;
}

export interface PipelineResult {
  wikitext: string;
}

export interface ExtractionResult {
  ir: IntermediateRepresentation;
  worklist: TranslationWorklist;
  source: ArticleRevisionSource;
  targetWiki: TargetWikiCode;
}

export class Pipeline {
  constructor(private readonly deps: PipelineDependencies) {}

  async runToExtraction(source: ArticleSource): Promise<ExtractionResult> {
    const { logger } = this.deps;

    logger.forStage("load-article").info("Loading article");
    const article = await this.deps.inputLoader.load(source);

    logger.forStage("parse-with-parsoid").info("Parsing with Parsoid");
    const ir = await this.deps.parser.parse(article);

    logger.forStage("resolve-wikidata-links").info("Resolving Wikidata links");
    await this.deps.linkResolver.resolve(ir);

    logger
      .forStage("extract-translatable-nodes")
      .info("Extracting translatable nodes");
    const worklist = await this.deps.extractor.extract(ir);

    return {
      ir,
      worklist,
      source: article.revision,
      targetWiki: this.deps.targetWiki,
    };
  }

  async reconstructFromRevision(
    source: ArticleRevisionSource,
    targetWiki: TargetWikiCode,
  ): Promise<ExtractionResult> {
    const { logger } = this.deps;

    logger
      .forStage("parse-with-parsoid")
      .info(
        `Fetching Wikipedia revision ${source.revisionId} of "${source.title}"`,
      );
    const sourceDomain = wikipediaDomainFromWiki(source.wiki);
    const html = await fetchRevisionHtml(source.revisionId, sourceDomain);
    const ir = buildIRFromParsoidHtml(
      html,
      source.title,
      logger.forStage("parse-with-parsoid"),
      sourceDomain,
    );

    logger.forStage("resolve-wikidata-links").info("Resolving Wikidata links");
    await this.deps.linkResolver.resolve(ir);

    logger
      .forStage("extract-translatable-nodes")
      .info("Extracting translatable nodes");
    const worklist = await this.deps.extractor.extract(ir);

    return { ir, worklist, source, targetWiki };
  }

  async deriveChunks(worklist: TranslationWorklist): Promise<Chunk[]> {
    this.deps.logger.forStage("chunking").info("Chunking");
    return this.deps.chunker.chunk(worklist);
  }

  async translateChunk(chunk: Chunk): Promise<TranslatedChunk> {
    return this.deps.translator.translateChunk(chunk);
  }

  async mergeChunk(
    ir: IntermediateRepresentation,
    translatedChunk: TranslatedChunk,
  ): Promise<IntermediateRepresentation> {
    return this.deps.merger.merge(ir, [translatedChunk]);
  }

  async applySessionChunk(
    ir: IntermediateRepresentation,
    sessionChunk: TranslationSession["chunks"][number],
  ): Promise<ApplySessionChunkResult> {
    return applySessionChunk(ir, sessionChunk, this.deps.merger);
  }

  async classifyReferenceAttention(
    ir: IntermediateRepresentation,
  ): Promise<void> {
    await this.deps.referenceAttention.classify(ir);
  }

  async generateWikitext(ir: IntermediateRepresentation): Promise<string> {
    this.deps.logger.forStage("generate-wikitext").info("Generating Wikitext");
    const wikitext = await this.deps.generator.generate(
      ir,
      getTargetWiki(this.deps.targetWiki),
    );
    this.deps.logger.info("Finished");
    return wikitext;
  }

  async continueWithBuiltInTranslation({
    ir,
    worklist,
  }: ExtractionResult): Promise<PipelineResult> {
    const chunks = await this.deriveChunks(worklist);

    let currentIr = ir;
    for (const chunk of chunks) {
      const translated = await this.translateChunk(chunk);
      currentIr = await this.mergeChunk(currentIr, translated);
    }

    await this.classifyReferenceAttention(currentIr);

    const wikitext = await this.generateWikitext(currentIr);
    return { wikitext };
  }

  async run(source: ArticleSource): Promise<PipelineResult> {
    const extraction = await this.runToExtraction(source);
    return this.continueWithBuiltInTranslation(extraction);
  }

  async continueWithSavedSession(session: TranslationSession): Promise<{
    wikitext: string;
    progress: SessionProgress;
    ignoredUnknownIds: string[];
  }> {
    const extraction = await this.reconstructFromRevision(
      session.source,
      session.meta.targetWiki,
    );

    let ir = extraction.ir;
    let translatedCount = 0;
    const ignoredUnknownIds: string[] = [];

    for (const sessionChunk of session.chunks) {
      const applied = await this.applySessionChunk(ir, sessionChunk);
      ir = applied.ir;
      translatedCount += applied.appliedCount;
      ignoredUnknownIds.push(...applied.ignoredUnknownIds);
    }

    await this.classifyReferenceAttention(ir);
    const wikitext = await this.generateWikitext(ir);

    return {
      wikitext,
      progress: calculateSessionProgress(session, translatedCount),
      ignoredUnknownIds,
    };
  }
}
