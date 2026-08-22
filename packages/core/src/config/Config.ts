import type { TargetWikiCode } from "./targetWikis";
import { DEFAULT_TARGET_WIKI } from "./targetWikis";

export interface OpenRouterProviderConfig {
  kind: "openrouter";
  model: string;
  apiKey: string;
}

export interface NineRouterProviderConfig {
  kind: "9router";
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

export const WIKIMEDIA_MODELS = [
  "deepseek/deepseek-v4-pro",
  "openai/gpt-5-mini",
  "openai/gpt-5.4-mini",
  "z-ai/glm-5.2",
  "google/gemini-2.5-flash",
  "google/gemini-3.5-flash-light",
] as const;

export type WikimediaModel = (typeof WIKIMEDIA_MODELS)[number];

export interface WikimediaProviderConfig {
  kind: "wikimedia";
  model: WikimediaModel;
  sessionToken: string;
}

export type LLMProviderConfig =
  | OpenRouterProviderConfig
  | NineRouterProviderConfig
  | WikimediaProviderConfig;

export const DEFAULT_OPENROUTER_MODEL = "google/gemini-2.5-flash";

export const DEFAULT_NINEROUTER_BASE_URL = "http://localhost:20128";

export interface PromptConfig {
  userPrompt?: string;
}

export interface PerseusConfig {
  activeProvider: LLMProviderConfig;
  prompt: PromptConfig;
  targetWiki: TargetWikiCode;
}

export const DEFAULT_CONFIG: PerseusConfig = {
  activeProvider: {
    kind: "openrouter",
    model: DEFAULT_OPENROUTER_MODEL,
    apiKey: "",
  },
  prompt: {
    userPrompt: undefined,
  },
  targetWiki: DEFAULT_TARGET_WIKI,
};
