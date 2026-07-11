/**
 * Translation Session — import (apply)
 *
 * Applies ONE chunk's translation entries onto an IR that has ALREADY
 * been reconstructed from that SAME session's own snapshot (see
 * Pipeline.reconstructFromSnapshot) — so this function has no
 * network/reconstruction concerns at all, only diff-and-merge logic.
 * "Translated" is determined by comparing each tuple's current text
 * against the freshly reconstructed node's original text — a tuple
 * identical to the original is a no-op, exactly as if it had never been
 * included.
 *
 * Called once per chunk — either in a loop, when cold-opening a saved
 * session (Pipeline.applySessionChunk for every persisted chunk), or a
 * single time, live, whenever one more chunk finishes translating
 * (either executor) during an interactive session.
 *
 * Deterministic rules, unchanged from the original Translation Package:
 *   1. Match entries by id.
 *   2. A changed text -> replace the node's translated text.
 *   3. An unchanged text, or a missing entry -> leave the node's
 *      original text untouched (a no-op — never included in the merge
 *      batch, so Merger never touches that node).
 *   4. Unknown ids -> ignored.
 *   5. Duplicate ids -> invalid; validate.ts aborts before this runs.
 *   6. Entry order does not matter (indexed by id, never by position).
 *
 * Reuses the existing Merger unchanged — this module never reconstructs
 * HTML itself, it only decides WHICH nodes to hand to Merger, exactly
 * like the built-in LLM executor does via Pipeline.mergeChunk.
 */

import type { TranslatedUnit } from "@core/chunker/segmentProtocol";
import type { IntermediateRepresentation } from "@core/ir/IntermediateRepresentation";
import type { Merger } from "@core/merge/Merger";
import type { SessionChunk, ApplySessionChunkResult } from "@core/translationPackage/types";

/**
 * Applies one session chunk's translation entries onto an IR that has
 * already been reconstructed from that SAME session's snapshot — never
 * onto an unrelated live-fetched IR, since ids are only guaranteed to
 * line up against the snapshot they were derived from.
 */
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
      ignoredUnknownIds.push(nodeId); // rule 4
      continue;
    }

    if (text === node.text) {
      continue; // rule 3: identical to the reconstructed original -> no-op
    }

    units.push({ nodeId, sourceText: node.text, translatedText: text }); // rule 2
  }

  const mergedIr = units.length > 0 ? await merger.merge(ir, [{ id: sessionChunk.id, units }]) : ir;

  return {
    ir: mergedIr,
    appliedCount: units.length,
    ignoredUnknownIds,
  };
}
