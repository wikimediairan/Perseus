import type { IntermediateRepresentation } from "../../ir/IntermediateRepresentation";

export interface TranslationUnit {
  nodeId: string;
  sourceText: string;
}
export type TranslationWorklist = TranslationUnit[];

export interface Extractor {
  extract(ir: IntermediateRepresentation): Promise<TranslationWorklist>;
}

const NO_LETTERS = /^\P{L}*$/u;

export class WikipediaExtractor implements Extractor {
  async extract(ir: IntermediateRepresentation): Promise<TranslationWorklist> {
    const worklist: TranslationWorklist = [];

    for (const node of ir.textNodes) {
      const withoutPlaceholderTokens = node.text.replaceAll(
        /\u27EA\/?\d+\u27EB/g,
        "",
      );

      if (
        !withoutPlaceholderTokens.trim() ||
        NO_LETTERS.test(withoutPlaceholderTokens)
      ) {
        continue;
      }

      worklist.push({ nodeId: node.id, sourceText: node.text });
    }

    return worklist;
  }
}
