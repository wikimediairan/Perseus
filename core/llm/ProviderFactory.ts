/**
 * ProviderFactory
 *
 * Single place that knows how to turn an LLMProviderConfig into a
 * concrete LLMProvider instance. This is the seam that keeps the rest of
 * the pipeline unaware of which concrete providers exist (Software
 * Specification, Section 11.1 — swapping providers must not ripple into
 * other stages).
 */

import type { LLMProviderConfig } from "@core/config/Config";
import { PerseusError } from "@core/errors/PerseusError";
import type { LLMProvider } from "@core/llm/LLMProvider";
import { AnthropicProvider } from "@core/llm/providers/AnthropicProvider";
import { GeminiProvider } from "@core/llm/providers/GeminiProvider";
import { OllamaProvider } from "@core/llm/providers/OllamaProvider";
import { OpenAIProvider } from "@core/llm/providers/OpenAIProvider";
import { OpenRouterProvider } from "@core/llm/providers/OpenRouterProvider";

export function createProvider(config: LLMProviderConfig): LLMProvider {
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

    default: {
      const exhaustiveCheck: never = config.kind;
      throw new PerseusError("ConfigurationError", `Unknown LLM provider kind: ${exhaustiveCheck}`);
    }
  }
}
