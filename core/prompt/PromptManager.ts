/**
 * PromptManager
 *
 * Owns the built-in default prompt and combines it with an optional user
 * prompt (Software Specification, Prompt System). The user prompt is
 * always appended after the default prompt and never replaces it.
 *
 * The default prompt is parameterized by TargetWikiDefinition
 * (languageName/domain) rather than hardcoding Persian/fa.wikipedia.org,
 * so adding a target wiki (config/targetWikis.ts) never requires touching
 * this file.
 *
 * Scope note: this module's contract stays limited to exactly what the
 * Prompt System section defines (default + user prompt composition).
 * The additional mechanical instructions needed for the chunk-segment /
 * placeholder-token wire protocol (see chunker/segmentProtocol.ts) are a
 * translation-implementation detail, not part of the user-facing prompt
 * system, so they are composed separately (by whichever executor needs
 * them — built-in or manual) rather than folded in here.
 */

import type { TargetWikiDefinition } from '@core/config/targetWikis';

function buildDefaultPrompt(targetWiki: TargetWikiDefinition): string {
  return [
    'You are translating Wikipedia article text from English into formal,',
    `encyclopaedic ${targetWiki.languageName} for ${targetWiki.domain}. Translate only the`,
    'natural-language meaning. Do not add, remove, or reinterpret facts.',
    `Use standard ${targetWiki.languageName} numerals and register appropriate for an`,
    'encyclopaedia article. Preserve any tokens or markers in the input',
    'exactly as they appear, in the same relative order, even if they look',
    'unusual — they are structural markers, not part of the text to',
    'translate.',
  ].join(' ');
}

export interface PromptManager {
  getDefaultPrompt(targetWiki: TargetWikiDefinition): string,
  buildPrompt(targetWiki: TargetWikiDefinition, userPrompt?: string): string,
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
