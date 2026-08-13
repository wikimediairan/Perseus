import type { TargetWikiCode } from "@core/config/targetWikis";
import { DEFAULT_TARGET_WIKI } from "@core/config/targetWikis";

export type LLMProviderConfig =
  | OllamaProviderConfig
  | LMStudioProviderConfig
  | OpenAIProviderConfig
  | OpenRouterProviderConfig
  | AnthropicProviderConfig
  | GeminiProviderConfig
  | WikimediaProviderConfig;

export interface OllamaProviderConfig {
  kind: "ollama";
  model: string;
  baseUrl?: string;
}

export interface LMStudioProviderConfig {
  kind: "lmstudio";
  model: string;
  baseUrl?: string;
}

export interface OpenAIProviderConfig {
  kind: "openai";
  model: string;
  apiKey: string;
}

export interface OpenRouterProviderConfig {
  kind: "openrouter";
  model: string;
  apiKey: string;
}

export interface AnthropicProviderConfig {
  kind: "anthropic";
  model: string;
  apiKey: string;
}

export interface GeminiProviderConfig {
  kind: "gemini";
  model: string;
  apiKey: string;
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
  apiKey: string;
}

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
    kind: "ollama",
    model: "",
    baseUrl: "http://localhost:11434",
  },
  prompt: {
    userPrompt: undefined,
  },
  targetWiki: DEFAULT_TARGET_WIKI,
};
