/**
 * Translation Session (`.perseus` file) — types
 *
 * A self-contained artifact representing an in-progress or finished
 * translation. Renamed conceptually from "Translation Package" to
 * "Translation Session" because its role has grown: it's no longer just
 * a one-shot external-translation exchange format, it's the save/resume
 * checkpoint for the whole chunk workspace (see the Design Proposal,
 * "Unified Chunk Architecture").
 *
 * `meta.format`/`meta.formatVersion` exist purely as forward-looking
 * metadata for whenever the format needs to change *next*. Versioning
 * policy: adding an optional key is NOT a breaking change and does not
 * bump formatVersion; changing the meaning/shape of an existing key IS
 * breaking and bumps it, and gets a branch in validate.ts's
 * version-dispatch (currently a single supported version — Perseus
 * hasn't shipped externally yet, so there is no v1 to migrate from, only
 * a clearly-marked place for a future migrator to go).
 *
 * Four top-level responsibilities, each with exactly one job:
 *
 *   meta        — what is this, what format, which target wiki, when.
 *
 *   snapshot    — the CANONICAL reconstruction source of truth. This is
 *                 the only thing `buildIRFromParsoidHtml` ever consumes
 *                 (see parser/ParsoidParser.ts, Pipeline.reconstructFromSnapshot).
 *                 Nothing else may be used to rebuild the IR. Kept
 *                 deliberately even though it's invisible to the chunk
 *                 workspace UI and to whatever a human pastes into an
 *                 external AI — see the Design Proposal, Section 2.2,
 *                 for why dropping it would let a resumed session
 *                 silently misattribute a translation to the wrong
 *                 paragraph if the live article has since changed.
 *
 *   provenance  — an AUXILIARY, non-authoritative record of the original
 *                 wikitext. Never fed into any parsing/reconstruction
 *                 function — kept solely for human-readable inspection,
 *                 future diffing, or debugging. Not a redundant copy of
 *                 `snapshot`: converting `snapshot.parsoidHtml` back into
 *                 wikitext would require another Parsoid round trip and
 *                 isn't guaranteed to reproduce the original
 *                 byte-for-byte, so this is genuinely independent data.
 *
 *   chunks      — the actual translation work, and the ONLY section a
 *                 human or an external AI ever needs to see. Grouped by
 *                 chunk (not a single flat array) so the SAME grouping
 *                 that was shown/copied/pasted in the UI, and the SAME
 *                 grouping the built-in LLM executor translated against,
 *                 round-trips through a save/resume cycle unchanged —
 *                 this is what makes "chunk" a single, shared translation
 *                 artifact instead of two representations that drift
 *                 apart. Each chunk's `translation` tuples are exactly
 *                 today's compact [id, tag, text] triples: numeric ids,
 *                 raw tag names, one mutable text field that starts as
 *                 English and gets replaced in place. No separate
 *                 "source"/"result" field anywhere — the original is
 *                 always re-derivable from `snapshot`, so storing it
 *                 twice would be pure waste.
 */

import type { TargetWikiCode } from "@core/config/targetWikis";
import type { IntermediateRepresentation } from "@core/ir/IntermediateRepresentation";

export const PACKAGE_FORMAT_MARKER = "perseus-package" as const;
export const CURRENT_FORMAT_VERSION = 2 as const;

export interface TranslationSessionMeta {
  articleTitle: string;
  sourceLanguage: string;
  targetWiki: TargetWikiCode;
  /** ISO 8601 timestamp of the last save. Informational only — nothing depends on it. */
  exportedAt: string;
  /**
   * The character budget SizeBoundedChunker used when this session's
   * chunks were first derived. Informational (chunks are persisted, not
   * re-derived from this — see `chunks` below), kept so the on-disk
   * file documents how its own grouping came about.
   */
  chunkCharBudget: number;
}

/**
 * The canonical reconstruction source of truth, and the ONLY thing that
 * is. `parsoidHtml` is captured AFTER Link Resolution has already run,
 * so resolved target-wiki link targets are already baked into it.
 */
export interface TranslationSessionSnapshot {
  parsoidHtml: string;
}

/** Auxiliary, non-authoritative. See the file-level doc comment. */
export interface TranslationSessionProvenance {
  rawWikitext: string;
}

/**
 * [numeric id, tag name, current text]. `id` is the TextNode's numeric
 * suffix (TextNode.id "text-7" -> 7 here). `tag` is the literal HTML tag
 * ("p", "h2", "td", ...). `text` is the ONE editable field: initially the
 * English source (with inline-markup placeholder tokens), replaced in
 * place with the target-wiki translation by a human, an external AI, or
 * the built-in LLM executor — all three are indistinguishable once
 * written here.
 */
export type TranslationEntryTuple = [id: number, tag: string, text: string];

/**
 * A chunk as it appears in a saved session: same `id` as the in-memory
 * `Chunk` it was derived from (core/chunker/Chunker.ts), carrying its
 * units' current translation state.
 */
export interface SessionChunk {
  id: string;
  translation: TranslationEntryTuple[];
}

export interface TranslationSession {
  format: typeof PACKAGE_FORMAT_MARKER;
  formatVersion: typeof CURRENT_FORMAT_VERSION;
  meta: TranslationSessionMeta;
  snapshot: TranslationSessionSnapshot;
  provenance: TranslationSessionProvenance;
  chunks: SessionChunk[];
}

export interface SessionProgress {
  translated: number;
  total: number;
  /** 0-100, rounded to the nearest whole percent. `0` when `total` is `0`. */
  percent: number;
}

export interface ApplySessionChunkResult {
  ir: IntermediateRepresentation;
  /** How many entries in this chunk actually had a changed text applied to a known node. */
  appliedCount: number;
  /** Entry ids in this chunk that don't correspond to any node in this IR. */
  ignoredUnknownIds: string[];
}
