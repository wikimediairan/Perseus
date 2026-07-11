/**
 * Merger
 *
 * Real implementation. Writes translated text back into the originating
 * IR TextNodes (Software Specification, Merge) by reconstructing HTML
 * from each unit's translated (placeholder-token) text and the
 * PlaceholderSpan table captured at extraction time, then assigning it
 * to the owning DOM element's `innerHTML`. This is one of only three
 * stages permitted to mutate the IR in place (Spec 7.1).
 *
 * Per Spec 12.2, a mismatch between translated chunks and their
 * originating IR nodes is a hard failure — checked before any mutation
 * happens, so a bad chunk can never leave the IR partially merged.
 *
 * Citation Handling Redesign: Merge never inspects HTML to reconstruct a
 * citation. It delegates entirely to reconstructHtmlFromPlaceholders,
 * passing `ir.citations` through unchanged — that function resolves any
 * citation-marker placeholder via the registry (CitationRegistry is the
 * single source of truth), never via a live DOM/HTML read. This file has
 * no citation-specific logic of its own; it only threads the registry to
 * the one place that needs it, and flushes any warnings the registry
 * accumulated during reconstruction (e.g. html-drift) to the logger.
 */

import { PerseusError } from "@core/errors/PerseusError";
import type { IntermediateRepresentation } from "@core/ir/IntermediateRepresentation";
import type { Logger } from "@core/logging/Logger";
import { reconstructHtmlFromPlaceholders } from "@core/parser/placeholders";
import type { TranslatedChunk } from "@core/translator/Translator";

export interface Merger {
  merge(
    ir: IntermediateRepresentation,
    translatedChunks: TranslatedChunk[],
  ): Promise<IntermediateRepresentation>;
}

export class DomMerger implements Merger {
  constructor(private readonly logger?: Logger) {}

  async merge(
    ir: IntermediateRepresentation,
    translatedChunks: TranslatedChunk[],
  ): Promise<IntermediateRepresentation> {
    if (translatedChunks.length === 0) {
      return ir;
    }

    const nodeById = new Map(ir.textNodes.map((node) => [node.id, node]));

    // Validate every referenced node exists before mutating anything (Spec 12.2).
    for (const chunk of translatedChunks) {
      for (const unit of chunk.units) {
        if (!nodeById.has(unit.nodeId)) {
          throw new PerseusError(
            "MergeError",
            `Translated unit references unknown IR node "${unit.nodeId}" — refusing to merge.`,
            {
              stage: "merge",
              context: { chunkId: chunk.id, nodeId: unit.nodeId },
            },
          );
        }

        if (!ir.structure.nodeElements.has(unit.nodeId)) {
          throw new PerseusError(
            "MergeError",
            `IR node "${unit.nodeId}" has no owning DOM element — refusing to merge.`,
            {
              stage: "merge",
              context: { chunkId: chunk.id, nodeId: unit.nodeId },
            },
          );
        }
      }
    }

    for (const chunk of translatedChunks) {
      for (const unit of chunk.units) {
        const element = ir.structure.nodeElements.get(unit.nodeId)!;
        const placeholders = ir.structure.placeholders.get(unit.nodeId) ?? [];
        element.innerHTML = reconstructHtmlFromPlaceholders(
          unit.translatedText,
          placeholders,
          ir.citations,
        );

        const textNode = nodeById.get(unit.nodeId)!;
        textNode.text = unit.translatedText;
      }
    }

    if (this.logger) {
      ir.citations.flushWarningsTo(this.logger);
    }

    return ir;
  }
}
