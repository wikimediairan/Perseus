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
 *   reconstructFromSnapshot(pkg) ............ same result shape, built
 *                                             from a saved session's
 *                                             snapshot instead of a live
 *                                             fetch (used to RESUME a
 *                                             session — no network at
 *                                             all until Generate)
 *
 *   deriveChunks(worklist) .................. Chunking. Called once,
 *                                             right after either of the
 *                                             above. The resulting
 *                                             Chunk[] is persisted
 *                                             verbatim in a saved
 *                                             session (see
 *                                             translationPackage/), not
 *                                             re-derived on resume.
 */

import type { Chunk, Chunker } from '@core/chunker/Chunker';
import type { TranslatedChunk } from '@core/chunker/segmentProtocol';
import type { TargetWikiCode } from '@core/config/targetWikis';
import { PerseusError } from '@core/errors/PerseusError';
import type { Extractor, TranslationWorklist } from '@core/extractor/Extractor';
import type { WikitextGenerator } from '@core/generator/WikitextGenerator';
import type { InputLoader, ArticleSource } from '@core/input/InputLoader';
import type { IntermediateRepresentation } from '@core/ir/IntermediateRepresentation';
import type { LinkResolver } from '@core/linkResolver/WikidataLinkResolver';
import type { Logger } from '@core/logging/Logger';
import type { Merger } from '@core/merge/Merger';
import type { Parser } from '@core/parser/ParsoidParser';
import { buildIRFromParsoidHtml } from '@core/parser/ParsoidParser';
import type { ReferenceAttentionClassifier } from '@core/referenceAttention/ReferenceAttention';
import { applySessionChunk } from '@core/translationPackage/import';
import { calculateSessionProgress } from '@core/translationPackage/progress';
import type {
  TranslationSession,
  SessionProgress,
  ApplySessionChunkResult,
} from '@core/translationPackage/types';
import type { Translator } from '@core/translator/Translator';

/** Reads the current root HTML from the IR's live DOM. Called exactly once, right after extraction — see ExtractionResult.parsoidSnapshotHtml for why this must never be called again later, once the IR may have been mutated by Merge. */
function captureSnapshotHtml(ir: IntermediateRepresentation): string {
  const root = ir.structure.document.getElementById('perseus-root');

  if (!root) {
    throw new PerseusError('GenerationError', 'The parsed document is missing its root element.');
  }

  return root.innerHTML;
}

export { PIPELINE_STAGE_ORDER } from '@core/pipeline/PipelineStage';
export type { PipelineStageName } from '@core/pipeline/PipelineStage';

/**
 * Every collaborator the pipeline needs, injected explicitly (manual
 * dependency injection, per the fixed architecture — no DI framework).
 * Reference Attention classification is included but, per Spec 7,
 * annotates the IR without gating pipeline progression.
 */
export interface PipelineDependencies {
  logger: Logger,
  inputLoader: InputLoader,
  parser: Parser,
  linkResolver: LinkResolver,
  extractor: Extractor,
  chunker: Chunker,
  translator: Translator,
  merger: Merger,
  generator: WikitextGenerator,
  referenceAttention: ReferenceAttentionClassifier,
  /** The target wiki this Pipeline instance was built for (createPipeline reads this from PerseusConfig). Recorded on ExtractionResult so a later save/export can't drift from what Link Resolution actually ran against. */
  targetWiki: TargetWikiCode,
}

export interface PipelineResult {
  wikitext: string,
}

/**
 * Result of the shared first half of the pipeline: everything up to and
 * including Extraction. `rawWikitext` is carried along so a session can
 * be saved from this point without needing to go back to InputLoader —
 * see translationPackage/export.ts.
 *
 * `parsoidSnapshotHtml` is captured ONCE here, immediately after Link
 * Resolution/Extraction, and never re-derived from the (mutable) `ir`
 * again afterwards. This matters: `ir`'s underlying DOM gets mutated in
 * place as chunks are translated and merged (Spec 8.2), so reading the
 * snapshot from the live DOM at SAVE time — instead of from this frozen
 * field — would silently bake already-translated text into what's
 * supposed to be the pure-English reconstruction anchor. That would
 * break the exact diff `applySessionChunk` relies on to tell "translated"
 * apart from "still original" on every subsequent reopen, not just the
 * first one. See translationPackage/export.ts.
 */
export interface ExtractionResult {
  ir: IntermediateRepresentation,
  worklist: TranslationWorklist,
  rawWikitext: string,
  targetWiki: TargetWikiCode,
  parsoidSnapshotHtml: string,
}

export class Pipeline {
  constructor(private readonly deps: PipelineDependencies) {}

  /** Load → Parse → Resolve Wikidata Links → Extract. Starts a new session against a LIVE article. */
  async runToExtraction(source: ArticleSource): Promise<ExtractionResult> {
    const { logger } = this.deps;

    logger.forStage('load-article').info('Loading article');
    const article = await this.deps.inputLoader.load(source);

    logger.forStage('parse-with-parsoid').info('Parsing with Parsoid');
    const ir = await this.deps.parser.parse(article);

    logger.forStage('resolve-wikidata-links').info('Resolving Wikidata links');
    await this.deps.linkResolver.resolve(ir);

    logger
      .forStage('extract-translatable-nodes')
      .info('Extracting translatable nodes');
    const worklist = await this.deps.extractor.extract(ir);

    return {
      ir,
      worklist,
      rawWikitext: article.rawWikitext,
      targetWiki: this.deps.targetWiki,
      parsoidSnapshotHtml: captureSnapshotHtml(ir),
    };
  }

  /**
   * Reconstructs an ExtractionResult from a saved session's own snapshot
   * — zero network access. `buildIRFromParsoidHtml` is the exact same
   * function `runToExtraction` uses internally (via ParsoidParser.parse);
   * only where the HTML comes from differs. Link Resolution is
   * deliberately NOT re-run here: the snapshot was captured after
   * resolution already happened at export time, so resolved hrefs are
   * already present in `snapshot.parsoidHtml`.
   *
   * `rawWikitext`/`targetWiki` come from the session's own metadata, not
   * re-read from this Pipeline's current config — a resumed session
   * always continues as whatever it was created for, even if the app's
   * "current" defaults have since changed.
   */
  async reconstructFromSnapshot(
    parsoidHtml: string,
    rawWikitext: string,
    sourceTitle: string,
    targetWiki: TargetWikiCode,
  ): Promise<ExtractionResult> {
    const { logger } = this.deps;

    logger
      .forStage('parse-with-parsoid')
      .info('Reconstructing article from saved session snapshot (no network)');
    const ir = buildIRFromParsoidHtml(
      parsoidHtml,
      sourceTitle,
      logger.forStage('parse-with-parsoid'),
    );

    logger
      .forStage('extract-translatable-nodes')
      .info('Extracting translatable nodes');
    const worklist = await this.deps.extractor.extract(ir);

    return { ir, worklist, rawWikitext, targetWiki, parsoidSnapshotHtml: parsoidHtml };
  }

  /**
   * Chunking. Called ONCE, right after `runToExtraction` or
   * `reconstructFromSnapshot`, for a NEW session. A resumed session
   * instead reuses its persisted chunk list verbatim (see
   * translationPackage/types.ts) rather than calling this again — see
   * the Design Proposal for why persisted grouping beats re-derivation.
   */
  async deriveChunks(worklist: TranslationWorklist): Promise<Chunk[]> {
    this.deps.logger.forStage('chunking').info('Chunking');
    return this.deps.chunker.chunk(worklist);
  }

  /** Translates ONE chunk via the built-in LLM executor — the same render/parse wire format a human pasting into an external AI goes through (see chunker/segmentProtocol.ts). */
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
   * see translationPackage/import.ts for the diff rule.
   */
  async applySessionChunk(
    ir: IntermediateRepresentation,
    sessionChunk: TranslationSession['chunks'][number],
  ): Promise<ApplySessionChunkResult> {
    return applySessionChunk(ir, sessionChunk, this.deps.merger);
  }

  /** Runs Reference Attention classification. Annotates the IR without gating progression (Spec 7) — safe to call once, any time after extraction. */
  async classifyReferenceAttention(ir: IntermediateRepresentation): Promise<void> {
    await this.deps.referenceAttention.classify(ir);
  }

  /** Generate Wikitext from the current IR. The one step in the whole flow that costs a real network call — always an explicit, final action. */
  async generateWikitext(ir: IntermediateRepresentation): Promise<string> {
    this.deps.logger.forStage('generate-wikitext').info('Generating Wikitext');
    const wikitext = await this.deps.generator.generate(ir);
    this.deps.logger.info('Finished');
    return wikitext;
  }

  /**
   * Convenience: translates every chunk via the built-in LLM, in order,
   * merging incrementally. Equivalent to calling `translateChunk` +
   * `mergeChunk` in a loop yourself — provided because "just translate
   * the whole thing automatically" is still the common case and
   * shouldn't require the caller to hand-roll the loop.
   */
  async continueWithBuiltInTranslation(
    { ir, worklist }: ExtractionResult,
  ): Promise<PipelineResult> {
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
   * Convenience: reconstructs a saved session from its own snapshot,
   * applies every persisted chunk's translation, and generates Wikitext
   * from whatever is translated so far (partial is fine — a session
   * saved mid-way still generates *something*, exactly like the
   * original Translation Package's "partial import" behavior). Zero
   * network access except the final Generate call.
   *
   * For an interactive resume (the chunk workspace), the caller should
   * instead call `reconstructFromSnapshot` + `applySessionChunk` per
   * chunk directly, so the UI can show accurate per-chunk progress
   * before the user does anything further. This method is for the
   * simpler "just show me the current Wikitext" case.
   */
  async continueWithSavedSession(session: TranslationSession): Promise<{
    wikitext: string,
    progress: SessionProgress,
    ignoredUnknownIds: string[],
  }> {
    const extraction = await this.reconstructFromSnapshot(
      session.snapshot.parsoidHtml,
      session.provenance.rawWikitext,
      session.meta.articleTitle,
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
