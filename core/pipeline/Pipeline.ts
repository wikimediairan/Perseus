/**
 * Pipeline
 *
 * The orchestrator that runs the fixed stage sequence described in the
 * Software Specification, Section 7:
 *
 *   Load Article → Parse with Parsoid → Intermediate Representation →
 *   Resolve Wikidata Links → Extract Translatable Nodes → Chunking →
 *   Translation → Merge → Generate Wikitext
 *
 * This orchestrator is intentionally "dumb": it does not contain business
 * logic itself. Each stage is injected (composition over inheritance) and
 * the orchestrator's only job is to call stages in order, thread the IR
 * and intermediate artifacts between them, and emit the required log
 * points.
 *
 * Unified Chunk Architecture: Chunking happens ONCE, immediately after
 * Extraction, regardless of who will translate the result — a chunk is
 * the single translation artifact shared by both executors (the
 * built-in LLM and a human pasting into an external AI). This class
 * exposes chunk-level primitives (`translateChunk`, `mergeChunk`) so a
 * caller can drive translation one chunk at a time, from either
 * executor, in any order, with interruption/resumption at any point —
 * as well as `run()`/`continueWithBuiltInTranslation`, a convenience
 * that drives every chunk through the built-in LLM automatically, for
 * the common "just translate the whole thing" case.
 *
 * Two ways to reach extraction + chunks, one shared tail from there:
 *
 *   runToExtraction(source) ................ Load→Parse→Resolve→Extract
 *                                             (live article; used to
 *                                             START a new session)
 *
 *   reconstructFromRevision(src) ........... same result shape and same
 *                                             Parse→Resolve→Extract
 *                                             sequence, but Parse fetches
 *                                             the article by its saved
 *                                             `revisionId` instead of by
 *                                             title (used to RESUME a
 *                                             session — still requires
 *                                             network, since the project
 *                                             no longer embeds a copy of
 *                                             the article; see
 *                                             translation-sessions/types.ts)
 *
 *   deriveChunks(worklist) .................. Chunking. Called once,
 *                                             right after either of the
 *                                             above. The resulting
 *                                             Chunk[] is persisted
 *                                             verbatim in a saved
 *                                             session (see
 *                                             translation-sessions/), not
 *                                             re-derived on resume.
 */

import type { TargetWikiCode } from "@core/config/targetWikis";
import type { IntermediateRepresentation } from "@core/ir/IntermediateRepresentation";
import type { Logger } from "@core/platform/logging/Logger";
import type {
  ArticleRevisionSource,
  ArticleSource,
  InputLoader,
} from "@core/stages/01-input/InputLoader";
import type { Parser } from "@core/stages/02-parsing/ParsoidParser";
import { buildIRFromParsoidHtml, fetchRevisionHtml } from "@core/stages/02-parsing/ParsoidParser";
import type { LinkResolver } from "@core/stages/03-link-resolution/WikidataLinkResolver";
import type { Extractor, TranslationWorklist } from "@core/stages/04-extraction/Extractor";
import type { Chunk, Chunker } from "@core/stages/05-chunking/Chunker";
import type { TranslatedChunk } from "@core/stages/05-chunking/segmentProtocol";
import type { Translator } from "@core/stages/06-translation/Translator";
import type { Merger } from "@core/stages/07-merge/Merger";
import type { ReferenceAttentionClassifier } from "@core/stages/08-reference-attention/ReferenceAttention";
import type { WikitextGenerator } from "@core/stages/09-generation/WikitextGenerator";
import { applySessionChunk } from "@core/translation-sessions/import";
import { calculateSessionProgress } from "@core/translation-sessions/progress";
import type {
  ApplySessionChunkResult,
  SessionProgress,
  TranslationSession,
} from "@core/translation-sessions/types";

export type { PipelineStageName } from "@core/pipeline/PipelineStage";
export { PIPELINE_STAGE_ORDER } from "@core/pipeline/PipelineStage";

/**
 * Every collaborator the pipeline needs, injected explicitly (manual
 * dependency injection, per the fixed architecture — no DI framework).
 * Reference Attention classification is included but, per Spec 7,
 * annotates the IR without gating pipeline progression.
 */
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
  /** The target wiki this Pipeline instance was built for (createPipeline reads this from PerseusConfig). Recorded on ExtractionResult so a later save/export can't drift from what Link Resolution actually ran against. */
  targetWiki: TargetWikiCode;
}

export interface PipelineResult {
  wikitext: string;
}

/**
 * Result of the shared first half of the pipeline: everything up to and
 * including Extraction. `source` is carried along so a session can be
 * saved from this point without needing to go back to InputLoader — see
 * translation-sessions/export.ts.
 */
export interface ExtractionResult {
  ir: IntermediateRepresentation;
  worklist: TranslationWorklist;
  source: ArticleRevisionSource;
  targetWiki: TargetWikiCode;
}

export class Pipeline {
  constructor(private readonly deps: PipelineDependencies) {}

  /** Load → Parse → Resolve Wikidata Links → Extract. Starts a new session against a LIVE article. */
  async runToExtraction(source: ArticleSource): Promise<ExtractionResult> {
    const { logger } = this.deps;

    logger.forStage("load-article").info("Loading article");
    const article = await this.deps.inputLoader.load(source);

    logger.forStage("parse-with-parsoid").info("Parsing with Parsoid");
    const ir = await this.deps.parser.parse(article);

    logger.forStage("resolve-wikidata-links").info("Resolving Wikidata links");
    await this.deps.linkResolver.resolve(ir);

    logger.forStage("extract-translatable-nodes").info("Extracting translatable nodes");
    const worklist = await this.deps.extractor.extract(ir);

    return {
      ir,
      worklist,
      source: article.revision,
      targetWiki: this.deps.targetWiki,
    };
  }

  /**
   * Reconstructs an ExtractionResult from a saved session's `source`
   * metadata (see translation-sessions/types.ts): fetches the exact
   * historical revision by `source.revisionId` — never the article's
   * current/latest revision by title — then runs the SAME
   * Parse→Resolve→Extract sequence `runToExtraction` uses for a live
   * article. `buildIRFromParsoidHtml` is the exact same function
   * `runToExtraction` uses internally (via ParsoidParser.parse); only
   * where the HTML comes from differs.
   *
   * Unlike the removed snapshot-based reconstruction, Link Resolution IS
   * re-run here: the project no longer caches post-resolution HTML, so
   * the freshly fetched revision HTML has not had target-wiki link
   * targets resolved into it yet.
   *
   * `targetWiki` comes from the session's own metadata, not re-read from
   * this Pipeline's current config — a resumed session always continues
   * as whatever it was created for, even if the app's "current" defaults
   * have since changed.
   */
  async reconstructFromRevision(
    source: ArticleRevisionSource,
    targetWiki: TargetWikiCode,
  ): Promise<ExtractionResult> {
    const { logger } = this.deps;

    logger
      .forStage("parse-with-parsoid")
      .info(`Fetching Wikipedia revision ${source.revisionId} of "${source.title}"`);
    const html = await fetchRevisionHtml(source.revisionId);
    const ir = buildIRFromParsoidHtml(html, source.title, logger.forStage("parse-with-parsoid"));

    logger.forStage("resolve-wikidata-links").info("Resolving Wikidata links");
    await this.deps.linkResolver.resolve(ir);

    logger.forStage("extract-translatable-nodes").info("Extracting translatable nodes");
    const worklist = await this.deps.extractor.extract(ir);

    return { ir, worklist, source, targetWiki };
  }

  /**
   * Chunking. Called ONCE, right after `runToExtraction` or
   * `reconstructFromRevision`, for a NEW session. A resumed session
   * instead reuses its persisted chunk list verbatim (see
   * translation-sessions/types.ts) rather than calling this again — see
   * the Design Proposal for why persisted grouping beats re-derivation.
   */
  async deriveChunks(worklist: TranslationWorklist): Promise<Chunk[]> {
    this.deps.logger.forStage("chunking").info("Chunking");
    return this.deps.chunker.chunk(worklist);
  }

  /** Translates ONE chunk via the built-in LLM executor — the same render/parse wire format a human pasting into an external AI goes through (see stages/05-chunking/segmentProtocol.ts). */
  async translateChunk(chunk: Chunk): Promise<TranslatedChunk> {
    return this.deps.translator.translateChunk(chunk);
  }

  /**
   * Merges one translated chunk into the IR, in place. Safe to call
   * repeatedly as chunks finish (via either executor) in any order —
   * Merger only touches the nodes referenced by this chunk's units.
   */
  async mergeChunk(
    ir: IntermediateRepresentation,
    translatedChunk: TranslatedChunk,
  ): Promise<IntermediateRepresentation> {
    return this.deps.merger.merge(ir, [translatedChunk]);
  }

  /**
   * Applies a saved session's chunk (tuples that may be partially or
   * fully translated already) onto a freshly reconstructed IR, merging
   * whatever has actually changed. Used when resuming a saved session —
   * see translation-sessions/import.ts for the diff rule.
   */
  async applySessionChunk(
    ir: IntermediateRepresentation,
    sessionChunk: TranslationSession["chunks"][number],
  ): Promise<ApplySessionChunkResult> {
    return applySessionChunk(ir, sessionChunk, this.deps.merger);
  }

  /** Runs Reference Attention classification. Annotates the IR without gating progression (Spec 7) — safe to call once, any time after extraction. */
  async classifyReferenceAttention(ir: IntermediateRepresentation): Promise<void> {
    await this.deps.referenceAttention.classify(ir);
  }

  /** Generate Wikitext from the current IR. The one step in the whole flow that costs a real network call — always an explicit, final action. */
  async generateWikitext(ir: IntermediateRepresentation): Promise<string> {
    this.deps.logger.forStage("generate-wikitext").info("Generating Wikitext");
    const wikitext = await this.deps.generator.generate(ir);
    this.deps.logger.info("Finished");
    return wikitext;
  }

  /**
   * Convenience: translates every chunk via the built-in LLM, in order,
   * merging incrementally. Equivalent to calling `translateChunk` +
   * `mergeChunk` in a loop yourself — provided because "just translate
   * the whole thing automatically" is still the common case and
   * shouldn't require the caller to hand-roll the loop.
   */
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

  /** Runs the full built-in-LLM pipeline end to end. Unchanged behavior — equivalent to runToExtraction + continueWithBuiltInTranslation. */
  async run(source: ArticleSource): Promise<PipelineResult> {
    const extraction = await this.runToExtraction(source);
    return this.continueWithBuiltInTranslation(extraction);
  }

  /**
   * Convenience: reconstructs a saved session from its own `source`
   * revision, applies every persisted chunk's translation, and generates
   * Wikitext from whatever is translated so far (partial is fine — a
   * session saved mid-way still generates *something*, exactly like the
   * original Translation Package's "partial import" behavior). Requires
   * network access throughout (revision fetch, Link Resolution, and the
   * final Generate call) — this format has no offline restoration path.
   *
   * For an interactive resume (the chunk workspace), the caller should
   * instead call `reconstructFromRevision` + `applySessionChunk` per
   * chunk directly, so the UI can show accurate per-chunk progress
   * before the user does anything further. This method is for the
   * simpler "just show me the current Wikitext" case.
   */
  async continueWithSavedSession(session: TranslationSession): Promise<{
    wikitext: string;
    progress: SessionProgress;
    ignoredUnknownIds: string[];
  }> {
    const extraction = await this.reconstructFromRevision(session.source, session.meta.targetWiki);

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
