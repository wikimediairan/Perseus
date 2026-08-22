import type { IntermediateRepresentation } from "../../ir/IntermediateRepresentation";
import { PerseusError } from "../../platform/errors/PerseusError";
import type { Logger } from "../../platform/logging/Logger";
import { reconstructHtmlFromPlaceholders } from "../02-parsing/placeholders";
import type { TranslatedChunk } from "../06-translation/Translator";

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
        const element = ir.structure.nodeElements.get(unit.nodeId);
        if (!element) {
          throw new PerseusError(
            "MergeError",
            `IR node "${unit.nodeId}" has no owning DOM element — refusing to merge.`,
            {
              stage: "merge",
              context: { chunkId: chunk.id, nodeId: unit.nodeId },
            },
          );
        }

        const placeholders = ir.structure.placeholders.get(unit.nodeId) ?? [];
        const templateWriter = ir.structure.templateParamWriters.get(
          unit.nodeId,
        );

        if (templateWriter) {
          templateWriter(unit.translatedText);
        } else {
          element.innerHTML = reconstructHtmlFromPlaceholders(
            unit.translatedText,
            placeholders,
            ir.citations,
          );
        }

        const textNode = nodeById.get(unit.nodeId);
        if (!textNode) {
          throw new PerseusError(
            "MergeError",
            `Translated unit references unknown IR node "${unit.nodeId}" — refusing to merge.`,
            {
              stage: "merge",
              context: { chunkId: chunk.id, nodeId: unit.nodeId },
            },
          );
        }
        textNode.text = unit.translatedText;
      }
    }

    if (this.logger) {
      ir.citations.flushWarningsTo(this.logger);
    }

    return ir;
  }
}
