import type { IntermediateRepresentation } from "../ir/IntermediateRepresentation";
import type { TranslatedUnit } from "../stages/05-chunking/segmentProtocol";
import type { Merger } from "../stages/07-merge/Merger";
import type { ApplySessionChunkResult, SessionChunk } from "./types";

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
