import type { TargetWikiDefinition } from "../../config/targetWikis";

function buildDefaultPrompt({
  domain,
  languageName,
}: TargetWikiDefinition): string {
  return [
    `Translate English article text into formal, encyclopedic ${languageName} for ${domain}.`,
    "RULES:",
    "1. Translate natural-language meaning faithfully using formal, encyclopedic language and standard orthography. Do not add, omit, summarize, or reinterpret facts.",
    `2. Convert standard digits in translated text to standard ${languageName} numerals. Never alter digits inside structural markers, tokens, tags, or metadata.`,
    "3. Before translating each segment, identify all protected markers (⟪n⟫, ⟪/n⟫, and ⟪*n⟫). Treat them as immutable tokens. Translate only the natural-language text spans associated with these markers.",
    "4. Preserve every structural marker exactly as-is. Never add, delete, duplicate, reorder, split, merge, or modify marker IDs or boundaries. Preserve spacing immediately adjacent to markers.",
    "5. Marker boundaries are strict. Never move text into or out of a marker span. Text inside a marker span may be translated, but each opening and closing marker must remain attached to the same text span.",
    '6. The FIRST line, starting with "[[PERSEUS CHUNK", is a machine-readable identity marker. Reproduce it character-for-character as the first line of the output.',
    "7. Preserve every [[SEGMENT n]] marker exactly unchanged and place it immediately before its corresponding translated segment. Keep the same segment boundaries.",
    "8. For personal names, translate the text normally inside marker spans using standard target-language transliteration unless a well-established target-language exonym exists.",
    "9. Before producing the final output, validate that:",
    "- The chunk identity line is identical to the input.",
    "- Every [[SEGMENT n]] marker appears exactly once and is unchanged.",
    "- Every structural marker (⟪n⟫, ⟪/n⟫, ⟪*n⟫) appears with the same ID, count, and adjacent spacing as the source.",
    "- No text has crossed a marker boundary.",
    "10. Output ONLY the chunk identity line followed by the translated segments. No conversational filler, commentary, or extra text.",
  ].join("\n");
}

export interface PromptManager {
  getDefaultPrompt(targetWiki: TargetWikiDefinition): string;
  buildPrompt(targetWiki: TargetWikiDefinition, userPrompt?: string): string;
}

export class DefaultPromptManager implements PromptManager {
  getDefaultPrompt(targetWiki: TargetWikiDefinition): string {
    return buildDefaultPrompt(targetWiki);
  }

  buildPrompt(targetWiki: TargetWikiDefinition, userPrompt?: string): string {
    const defaultPrompt = buildDefaultPrompt(targetWiki);

    if (!userPrompt || userPrompt.trim().length === 0) {
      return defaultPrompt;
    }

    return `${defaultPrompt}\n\n${userPrompt.trim()}`;
  }
}
