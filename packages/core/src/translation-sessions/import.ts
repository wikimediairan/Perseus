import type { IntermediateRepresentation } from "../ir/IntermediateRepresentation.js";
import type { TranslatedUnit } from "../stages/05-chunking/segmentProtocol.js";
import type { Merger } from "../stages/07-merge/Merger.js";
import type { ApplySessionChunkResult, SessionChunk } from "./types.js";

export async function applySessionChunk(
  ir: IntermediateRepresentation,
  sessionChunk: SessionChunk,
  merger: Merger,
): Promise<ApplySessionChunkResult> {
  const nodeById = new Map(ir.textNodes.map((node) => [node.id, node]));
  const ignoredUnknownIds: string[] = [];
  const units: TranslatedUnit[] = [];

  for (const [numericId, , text] of sessionChunk.translation) {
    const nodeId = `text-${numericId}`;
    const node = nodeById.get(nodeId);

    if (!node) {
      ignoredUnknownIds.push(nodeId);
      continue;
    }

    if (text === node.text) {
      continue;
    }

    units.push({ nodeId, sourceText: node.text, translatedText: text });
  }

  const mergedIr =
    units.length > 0
      ? await merger.merge(ir, [{ id: sessionChunk.id, units }])
      : ir;

  return {
    ir: mergedIr,
    appliedCount: units.length,
    ignoredUnknownIds,
  };
}
