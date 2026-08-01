import type { LLMProviderConfig } from "@core/config/Config";
import { PerseusError } from "@core/platform/errors/PerseusError";
import type { TextProviderType } from "@core/stages/06-translation/LLMProvider";
import { AnthropicProvider } from "@core/stages/06-translation/providers/AnthropicProvider";
import { GeminiProvider } from "@core/stages/06-translation/providers/GeminiProvider";
import { OllamaProvider } from "@core/stages/06-translation/providers/OllamaProvider";
import { OpenAIProvider } from "@core/stages/06-translation/providers/OpenAIProvider";
import { OpenRouterProvider } from "@core/stages/06-translation/providers/OpenRouterProvider";
import type { WikimediaProviderType } from "@core/wikimedia-provider/contract";
import { WikimediaProvider } from "@core/wikimedia-provider/WikimediaProvider";

/**
 * Returns the narrower `TextProviderType | WikimediaProviderType` union
 * (not the base `LLMProvider`) so callers can actually invoke `.translate`
 * — the base interface only carries `kind`, by design, since the two
 * translation contracts (text protocol vs. Wikimedia's chunk protocol)
 * are shaped completely differently.
 */
export function createProvider(
  config: LLMProviderConfig,
): TextProviderType | WikimediaProviderType {
  switch (config.kind) {
    case "ollama": {
      return new OllamaProvider({
        baseUrl: config.baseUrl ?? "http://localhost:11434",
        model: config.model,
      });
    }

    case "openai": {
      return new OpenAIProvider({
        apiKey: config.apiKey,
        model: config.model,
      });
    }

    case "openrouter": {
      return new OpenRouterProvider({
        apiKey: config.apiKey,
        model: config.model,
      });
    }

    case "anthropic": {
      return new AnthropicProvider({
        apiKey: config.apiKey,
        model: config.model,
      });
    }

    case "gemini": {
      return new GeminiProvider({ apiKey: config.apiKey, model: config.model });
    }

    case "wikimedia": {
      return new WikimediaProvider();
    }

    default: {
      throw new PerseusError("ConfigurationError", "Unknown LLM provider");
    }
  }
}

/**
 * Type predicate distinguishing Wikimedia's chunk-level protocol from the
 * shared text protocol. Plain `kind === "wikimedia"` comparisons don't
 * narrow `TextProviderType | WikimediaProviderType` on their own, since
 * both interfaces inherit the same wide `kind` union from `LLMProvider` —
 * this predicate makes the narrowing explicit for callers that need to
 * branch on it (e.g. createPipeline, which only supports the text
 * protocol today).
 */
export function isWikimediaProvider(
  provider: TextProviderType | WikimediaProviderType,
): provider is WikimediaProviderType {
  return provider.kind === "wikimedia";
}
