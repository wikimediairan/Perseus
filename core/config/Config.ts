/**
 * Config
 *
 * Configuration object shapes for Perseus (Software Specification,
 * Configuration). Models the required concerns: LLM provider
 * selection/credentials, the prompt system's user-supplied addition, and
 * the selected Target Wiki (which wiki a translation is produced for —
 * see config/targetWikis.ts). No advanced settings, no Wikipedia
 * credentials (there is no login/publishing feature — see Non-Goals).
 */

import type { TargetWikiCode } from "@core/config/targetWikis";
import { DEFAULT_TARGET_WIKI } from "@core/config/targetWikis";
import type { LLMProviderKind } from "@core/llm/LLMProvider";

export interface LLMProviderConfig {
  kind: LLMProviderKind;
  /** Model identifier, meaning is provider-specific (e.g. "llama3", "gpt-4o-mini"). */
  model: string;
  /**
   * Base URL for the provider's API. Required for Ollama (local) and
   * OpenAI endpoints; optional/fixed for OpenRouter.
   */
  baseUrl?: string;
  /**
   * API key/credential, if required by the provider. Never logged, never
   * included in PerseusError context (see PerseusError.context guidance).
   */
  apiKey?: string;
}

export interface PromptConfig {
  /** User-supplied prompt text, appended after the built-in default prompt. Never replaces it. */
  userPrompt?: string;
}

export interface PerseusConfig {
  activeProvider: LLMProviderConfig;
  prompt: PromptConfig;
  /** Which wiki this translation targets (Persian Wikipedia, Tajik Wikipedia, ...). Chosen before loading an article, since Link Resolution depends on it. */
  targetWiki: TargetWikiCode;
}

/**
 * A conservative default configuration. No provider is assumed reachable;
 * callers must supply real values via ConfigLoader before running the
 * pipeline. Present mainly so the app has something to render before the
 * user has configured anything.
 */
export const DEFAULT_CONFIG: PerseusConfig = {
  activeProvider: {
    kind: "ollama",
    model: "",
    baseUrl: "http://localhost:11434",
  },
  prompt: {
    userPrompt: undefined,
  },
  targetWiki: DEFAULT_TARGET_WIKI,
};
