import type { TargetWikiDefinition } from "@core/config/targetWikis";

function buildDefaultPrompt({ domain, languageName }: TargetWikiDefinition): string {
  return [
    `Translate English article text into formal, encyclopedic ${languageName} for ${domain}.`,
    "RULES:",
    "1. Translate natural-language meaning only. Do not add, remove, summarize, or reinterpret facts.",
    `2. Use standard ${languageName} numerals only in translated text. Never alter digits inside structural markers, tokens, or tags.`,
    "3. Preserve all structural tags (e.g., ⟪1⟫...⟪/1⟫) exactly unchanged, but translate the text enclosed within them.",
    "4. Preserve [[SEGMENT n]] markers exactly unchanged, including their digits and place each one immediately before its translated segment.",
    "5. Output only the translated segments. No introduction, commentary, explanations, or extra text.",
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
