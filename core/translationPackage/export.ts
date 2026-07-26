/**
 * Translation Session — export (save)
 *
 * Builds a self-contained TranslationSession from an ExtractionResult
 * plus its derived Chunk list (Pipeline.runToExtraction +
 * Pipeline.deriveChunks have already happened by this point). `source` is
 * taken verbatim from `extraction.source` — the immutable Wikipedia
 * revision this article was loaded from — never a copy of the article's
 * rendered content.
 *
 * Reads each unit's CURRENT text from `ir.textNodes` (not from the
 * Chunk's frozen `sourceText`), so saving mid-session correctly captures
 * whatever has been translated so far, chunk by chunk — this is what
 * lets "Save Session" work as a true checkpoint of live progress, not
 * just a one-shot initial export.
 */

import type { Chunk } from "@core/chunker/Chunker";
import { PerseusError } from "@core/errors/PerseusError";
import type { ExtractionResult } from "@core/pipeline/Pipeline";
import type {
  SessionChunk,
  TranslationEntryTuple,
  TranslationSession,
} from "@core/translationPackage/types";
import { CURRENT_FORMAT_VERSION, PACKAGE_FORMAT_MARKER } from "@core/translationPackage/types";

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
 * Pipeline.deriveChunks have already happened by this point). `source`
 * always comes from `extraction.source`, since every article Perseus
 * loads is a live Wikipedia article (there is no local-file input path)
 * and therefore always has a revision to reference.
 *
 * The per-unit CURRENT text for `chunks[].translation` is read from the
 * live `ir.textNodes` (not from any frozen copy) — that's supposed to
 * reflect whatever has been translated so far, which is the entire point
 * of being able to save mid-session.
 */
export function exportTranslationSession(
  extraction: ExtractionResult,
  chunks: Chunk[],
  chunkCharBudget: number,
): TranslationSession {
  const { ir, source, targetWiki } = extraction;

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
      sourceLanguage: "en",
      targetWiki,
      exportedAt: new Date().toISOString(),
      chunkCharBudget,
    },
    source,
    chunks: sessionChunks,
  };
}
