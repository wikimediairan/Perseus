import type { ExtractionResult } from "@core/pipeline/Pipeline";
import { PerseusError } from "@core/platform/errors/PerseusError";
import type { Chunk } from "@core/stages/05-chunking/Chunker";
import type {
  SessionChunk,
  TranslationEntryTuple,
  TranslationSession,
} from "@core/translation-sessions/types";
import { CURRENT_FORMAT_VERSION, PACKAGE_FORMAT_MARKER } from "@core/translation-sessions/types";

export const EXTERNAL_TRANSLATION_INSTRUCTIONS =
  'Each chunk below has a "translation" list of [id, tag, text] entries. Replace each entry\'s "text" with its translation, in place. If a text contains tokens that look like ⟪1⟫...⟪/1⟫, keep those exact tokens in your translation, in the same order — they mark links or formatting that Perseus will restore automatically. Leave "id" and "tag" unchanged, and leave any entry you do not want to translate exactly as-is.';

function numericSuffix(nodeId: string): number {
  const match = /^text-(\d+)$/.exec(nodeId);

  if (!match) {
    throw new PerseusError("GenerationError", `Unexpected TextNode id shape: "${nodeId}".`);
  }

  return Number(match[1]);
}

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
