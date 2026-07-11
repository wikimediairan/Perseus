/**
 * Extractor
 *
 * Real implementation. Reads the IR (read-only — Spec 7.1) and produces
 * a TranslationWorklist: one TranslationUnit per eligible TextNode. The
 * heavy lifting of DECIDING what counts as translatable structure (which
 * DOM elements, excluding templates/references) already happened in
 * ParsoidParser while building `ir.textNodes` — that is an IR
 * construction concern (Spec 8.1, "make natural-language content
 * addressable"). This stage's own job is narrower: filter out nodes that
 * aren't worth sending to translation at all (empty, whitespace-only, or
 * containing no actual letters — e.g. a cell that's just a number or a
 * placeholder token with nothing else).
 */

import type { IntermediateRepresentation } from '@core/ir/IntermediateRepresentation';

export interface TranslationUnit {
  nodeId: string,
  sourceText: string,
}
export type TranslationWorklist = TranslationUnit[];

export interface Extractor {
  extract(ir: IntermediateRepresentation): Promise<TranslationWorklist>,
}

/** Matches strings with no meaningful letter content (pure numbers, punctuation, or placeholder tokens only). */
const NO_LETTERS = /^\P{L}*$/u;

export class WikipediaExtractor implements Extractor {
  async extract(ir: IntermediateRepresentation): Promise<TranslationWorklist> {
    const worklist: TranslationWorklist = [];

    for (const node of ir.textNodes) {
      const withoutPlaceholderTokens = node.text.replaceAll(
        /\u27EA\/?\d+\u27EB/g,
        '',
      );

      if (
        !withoutPlaceholderTokens.trim() || NO_LETTERS.test(withoutPlaceholderTokens)
      ) {
        continue;
      }

      worklist.push({ nodeId: node.id, sourceText: node.text });
    }

    return worklist;
  }
}
