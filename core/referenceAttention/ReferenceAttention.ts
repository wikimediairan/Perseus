/**
 * ReferenceAttention
 *
 * Real implementation. Classifies statements as OK or Needs Human Review
 * (Software Specification, Reference Attention) using deterministic
 * keyword/pattern heuristics — explicitly NOT a fact-checking or
 * reliability judgment (Spec: "This is only a review flag, not fact
 * checking"). A second LLM call was deliberately avoided here to keep
 * the stage simple, fast, and free of an extra network dependency,
 * consistent with "prefer simple designs over clever abstractions."
 *
 * Runs over the extracted English source text (before translation),
 * since the categories being flagged (statistics, medical/legal content,
 * extraordinary claims) are properties of the original claim, not of the
 * translation.
 */

import type { IntermediateRepresentation } from "@core/ir/IntermediateRepresentation";

export type ReferenceAttentionClassification = "ok" | "needs-human-review";

export interface ReferenceAttentionAnnotation {
  nodeId: string;
  classification: ReferenceAttentionClassification;
  reason?: string;
}

export interface ReferenceAttentionClassifier {
  classify(ir: IntermediateRepresentation): Promise<ReferenceAttentionAnnotation[]>;
}

interface HeuristicRule {
  reason: string;
  pattern: RegExp;
}

const RULES: HeuristicRule[] = [
  {
    reason: "statistic",
    pattern: /\b\d{1,3}(,\d{3})*(\.\d+)?\s?(%|billion\b|million\b|percent\b|thousand\b)/i,
  },
  {
    reason: "medical content",
    pattern:
      /\b(cancer|clinical trial|diagnos(ed|is)|disease|dosage|medication|mortality rate|surgery|symptom|treatment|vaccine|virus)\b/i,
  },
  {
    reason: "legal content",
    pattern:
      /\b(convicted|court|illegal|indictment|lawsuit|legislation|litigation|sentenced|statute|unlawful)\b/i,
  },
  {
    reason: "extraordinary claim",
    pattern:
      /\b(first ever|guaranteed|never before|proven to|record-breaking|unprecedented|world's (first|largest|only))\b/i,
  },
];

export class HeuristicReferenceAttentionClassifier implements ReferenceAttentionClassifier {
  async classify(ir: IntermediateRepresentation): Promise<ReferenceAttentionAnnotation[]> {
    const annotations: ReferenceAttentionAnnotation[] = [];

    for (const node of ir.textNodes) {
      const plainText = node.text.replaceAll(/\u27EA\/?\d+\u27EB/g, "");
      const match = RULES.find((rule) => rule.pattern.test(plainText));

      annotations.push(
        match
          ? {
              nodeId: node.id,
              classification: "needs-human-review",
              reason: match.reason,
            }
          : { nodeId: node.id, classification: "ok" },
      );
    }

    return annotations;
  }
}
