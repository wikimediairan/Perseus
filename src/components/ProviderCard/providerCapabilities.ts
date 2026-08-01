import type { LLMProviderConfig, WikimediaModel } from "@core/config/Config";
import { WIKIMEDIA_MODELS } from "@core/config/Config";
import type { TFunction } from "i18next";

export const getProviderLabels = (t: TFunction): Record<LLMProviderConfig["kind"], string> => ({
  ollama: t("providerCard.providers.ollama"),
  openai: t("providerCard.providers.openai"),
  openrouter: t("providerCard.providers.openrouter"),
  anthropic: t("providerCard.providers.anthropic"),
  gemini: t("providerCard.providers.gemini"),
  wikimedia: t("providerCard.providers.wikimedia"),
});

/**
 * Capability sets driving which fields ProviderCard shows for the active
 * provider. Wikimedia gets its own model picker (see ModelField) rather
 * than joining PROVIDERS_WITH_USER_PROMPT — its translation contract has
 * no free-text system prompt to append to.
 */
export const PROVIDERS_WITH_BASE_URL = new Set<LLMProviderConfig["kind"]>(["ollama"]);

export const PROVIDERS_WITH_API_KEY = new Set<LLMProviderConfig["kind"]>([
  "openai",
  "openrouter",
  "anthropic",
  "gemini",
  "wikimedia",
]);

export const PROVIDERS_WITH_USER_PROMPT = new Set<LLMProviderConfig["kind"]>([
  "ollama",
  "openai",
  "openrouter",
  "anthropic",
  "gemini",
]);

export const WIKIMEDIA_MODEL_LABELS: Record<WikimediaModel, string> = {
  "google/gemini-3.5-flash": "Gemini 3.5 Flash",
  "google/gemini-2.5-flash": "Gemini 2.5 Flash",
  "google/gemini-3.5-flash-light": "Gemini 3.5 Flash Light",
};

export const MODEL_PLACEHOLDER: Record<LLMProviderConfig["kind"], string> = {
  ollama: "llama3",
  openai: "gpt-4o-mini",
  openrouter: "anthropic/claude-3.5-sonnet",
  anthropic: "claude-sonnet-4-5",
  gemini: "gemini-2.5-flash",
  wikimedia: WIKIMEDIA_MODELS[1],
};

/** Builds a fresh, valid config for `kind` — every field required by that provider's config type is present, so switching providers can never leave an invalid/partial config behind. */
export function createProviderConfig(kind: LLMProviderConfig["kind"]): LLMProviderConfig {
  switch (kind) {
    case "ollama": {
      return { kind, model: "", baseUrl: "http://localhost:11434" };
    }

    case "openai":
    case "openrouter":
    case "anthropic":
    case "gemini": {
      return { kind, model: "", apiKey: "" };
    }

    case "wikimedia": {
      return { kind, model: WIKIMEDIA_MODELS[1], apiKey: "" };
    }
  }
}
