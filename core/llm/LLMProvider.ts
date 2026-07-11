/**
 * LLMProvider
 *
 * Provider abstraction (Software Specification, Section 11). The pipeline
 * depends only on this interface — swapping the underlying LLM vendor
 * must never require changes to parsing, IR construction, link
 * resolution, extraction, chunking, merge, or Wikitext generation
 * (Spec 11.1).
 *
 * The LLM's scope is strictly translation of natural-language text (Spec
 * Section 10) — this interface has no surface area for parsing, link
 * resolution, or structural editing by design.
 */

import type { TargetWikiCode } from "@core/config/targetWikis";

export type LLMProviderKind = "gemini" | "ollama" | "anthropic" | "openrouter" | "openai";

export interface TranslationRequest {
  /** Built-in default prompt, always present, followed by the optional user prompt appended after it (Spec Section 4.9). */
  systemPrompt: string;
  /** Natural-language English text only — never Wikitext markup (Spec Section 10.4). */
  sourceText: string;
  /** Target wiki's language code (see config/targetWikis.ts). Modeled explicitly rather than hardcoded to Persian, so new target wikis are a registry addition, not a type change here. */
  targetLanguage: TargetWikiCode;
}

export interface TranslationResult {
  translatedText: string;
}

/**
 * Uniform contract every concrete provider (Ollama, OpenAI,
 * OpenRouter, Anthropic, Gemini, ...) must satisfy. See Spec 11.2 — this specification does
 * not mandate a specific interface signature beyond what's needed to
 * keep the pipeline provider-agnostic; this is the scaffold phase's
 * concrete proposal for that signature.
 */
export interface LLMProvider {
  readonly kind: LLMProviderKind;
  translate(request: TranslationRequest): Promise<TranslationResult>;
}
