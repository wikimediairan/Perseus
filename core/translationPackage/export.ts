/**
 * Translation Session — export (save)
 *
 * Builds a self-contained TranslationSession from an ExtractionResult
 * plus its derived Chunk list (Pipeline.runToExtraction +
 * Pipeline.deriveChunks have already happened by this point). The
 * snapshot is captured from the IR's live DOM AFTER link resolution, so
 * resolved target-wiki link targets are already baked into it.
 *
 * Reads each unit's CURRENT text from `ir.textNodes` (not from the
 * Chunk's frozen `sourceText`), so saving mid-session correctly captures
 * whatever has been translated so far, chunk by chunk — this is what
 * lets "Save Session" work as a true checkpoint of live progress, not
 * just a one-shot initial export.
 *
 * `snapshot.parsoidHtml` and `provenance.rawWikitext` are populated from
 * two different sources on purpose — see types.ts for why they are not
 * redundant with each other.
 */

import type { Chunk } from "@core/chunker/Chunker";
import { PerseusError } from "@core/errors/PerseusError";
import type { ExtractionResult } from "@core/pipeline/Pipeline";
import type {
  SessionChunk,
  TranslationSession,
  TranslationEntryTuple,
} from "@core/translationPackage/types";
import {
  PACKAGE_FORMAT_MARKER,
  CURRENT_FORMAT_VERSION,
} from "@core/translationPackage/types";

/** Shown to the user alongside a saved session (e.g. in the UI) — not stored in the JSON itself, since the schema is fixed. */
export const EXTERNAL_TRANSLATION_INSTRUCTIONS =
  'Each chunk below has a "translation" list of [id, tag, text] entries. Replace each entry\'s "text" with its translation, in place. If a text contains tokens that look like ⟪1⟫...⟪/1⟫, keep those exact tokens in your translation, in the same order — they mark links or formatting that Perseus will restore automatically. Leave "id" and "tag" unchanged, and leave any entry you do not want to translate exactly as-is.';

/** "text-7" -> 7. Throws if the id doesn't match the expected shape — that would indicate an internal inconsistency, not a user error. */
function numericSuffix(nodeId: string): number {
  const match = /^text-(\d+)$/.exec(nodeId);

  if (!match) {
    throw new PerseusError("GenerationError", `Unexpected TextNode id shape: "${nodeId}".`);
  }

  return Number(match[1]);
}

/**
 * Builds a self-contained TranslationSession from an ExtractionResult
 * plus its derived Chunk list (Pipeline.runToExtraction +
 * Pipeline.deriveChunks have already happened by this point).
 *
 * `snapshot.parsoidHtml` is taken verbatim from
 * `extraction.parsoidSnapshotHtml` — frozen at extraction time, NEVER
 * re-read from `ir`'s live DOM, which may since have been mutated by
 * Merge. See Pipeline.ts's ExtractionResult doc comment for why reading
 * it from the live DOM here would be a correctness bug (it would bake
 * already-translated text into the reconstruction anchor, breaking the
 * diff a later reopen depends on).
 *
 * The per-unit CURRENT text for `chunks[].translation`, in contrast, IS
 * read from the live `ir.textNodes` (not from the frozen snapshot) —
 * that's supposed to reflect whatever has been translated so far, which
 * is the entire point of being able to save mid-session.
 */
export function exportTranslationSession(
  extraction: ExtractionResult,
  chunks: Chunk[],
  chunkCharBudget: number,
): TranslationSession {
  const { ir, rawWikitext, targetWiki, parsoidSnapshotHtml } = extraction;

  const currentTextByNodeId = new Map(ir.textNodes.map((node) => [node.id, node.text]));

  const sessionChunks: SessionChunk[] = chunks.map((chunk) => {
    const translation: TranslationEntryTuple[] = chunk.units.map((unit) => {
      const tag = ir.structure.nodeElements.get(unit.nodeId)?.tagName.toLowerCase() ?? "unknown";
      const currentText = currentTextByNodeId.get(unit.nodeId) ?? unit.sourceText;
      return [numericSuffix(unit.nodeId), tag, currentText];
    });

    return { id: chunk.id, translation };
  });

  return {
    format: PACKAGE_FORMAT_MARKER,
    formatVersion: CURRENT_FORMAT_VERSION,
    meta: {
      articleTitle: ir.sourceTitle,
      sourceLanguage: "en",
      targetWiki,
      exportedAt: new Date().toISOString(),
      chunkCharBudget,
    },
    snapshot: {
      parsoidHtml: parsoidSnapshotHtml,
    },
    provenance: {
      rawWikitext,
    },
    chunks: sessionChunks,
  };
}
