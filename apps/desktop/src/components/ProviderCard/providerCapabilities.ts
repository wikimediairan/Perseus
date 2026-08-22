import type { LLMProviderConfig, WikimediaModel } from "@perseus/core";
import { WIKIMEDIA_MODELS } from "@perseus/core";
import type { TFunction } from "i18next";

export const getProviderLabels = (
  t: TFunction,
): Record<LLMProviderConfig["kind"], string> => ({
  "9router": t("providerCard.providers.ninerouter"),
  openrouter: t("providerCard.providers.openrouter"),
  wikimedia: t("providerCard.providers.wikimedia"),
});

export const PROVIDERS_WITH_BASE_URL = new Set<LLMProviderConfig["kind"]>([
  "9router",
]);

export const PROVIDERS_WITH_API_KEY = new Set<LLMProviderConfig["kind"]>([
  "openrouter",
  "9router",
]);

export const PROVIDERS_WITH_USER_PROMPT = new Set<LLMProviderConfig["kind"]>([
  "openrouter",
  "9router",
]);

export const WIKIMEDIA_MODEL_LABELS: Record<WikimediaModel, string> = {
  "deepseek/deepseek-v4-pro": "DeepSeek V4 Pro",
  "openai/gpt-5-mini": "GPT 5 Mini",
  "openai/gpt-5.4-mini": "GPT 5.4 Mini",
  "z-ai/glm-5.2": "GLM 5.2",
  "google/gemini-2.5-flash": "Gemini 2.5 Flash",
  "google/gemini-3.5-flash-light": "Gemini 3.5 Flash Light",
};

export const MODEL_PLACEHOLDER: Record<LLMProviderConfig["kind"], string> = {
  openrouter: "anthropic/claude-3.5-sonnet",
  "9router": "",
  wikimedia: WIKIMEDIA_MODELS[1],
};

export function createProviderConfig(
  kind: LLMProviderConfig["kind"],
): LLMProviderConfig {
  switch (kind) {
    case "9router": {
      return { kind, model: "", apiKey: "", baseUrl: "" };
    }

    case "openrouter": {
      return { kind, model: "", apiKey: "" };
    }

    case "wikimedia": {
      return { kind, model: WIKIMEDIA_MODELS[1], sessionToken: "" };
    }
  }
}
