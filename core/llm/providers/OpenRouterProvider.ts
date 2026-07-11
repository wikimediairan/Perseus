/**
 * OpenRouterProvider
 *
 * Real implementation for OpenRouter (https://openrouter.ai), which
 * speaks the same OpenAI-style chat completions protocol at a fixed
 * endpoint. Kept as a distinct class from OpenAIProvider (even
 * though it shares the `chatCompletion` helper) so its endpoint/headers
 * are pre-configured and the two providers can be selected independently
 * in configuration (Provider Abstraction, Spec 11).
 */

import { PerseusError } from "@core/errors/PerseusError";
import { chatCompletion } from "@core/llm/chatProtocol";
import type {
  LLMProvider,
  LLMProviderKind,
  TranslationResult,
  TranslationRequest,
} from "@core/llm/LLMProvider";

export interface OpenRouterProviderConfig {
  apiKey?: string;
  model: string;
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export class OpenRouterProvider implements LLMProvider {
  readonly kind: LLMProviderKind = "openrouter";

  constructor(private readonly config: OpenRouterProviderConfig) {}

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    if (!this.config.apiKey) {
      throw new PerseusError("ConfigurationError", "No API key configured for OpenRouter.", {
        stage: "llm-translation",
      });
    }

    if (!this.config.model) {
      throw new PerseusError("ConfigurationError", "No model configured for OpenRouter.", {
        stage: "llm-translation",
      });
    }

    const translatedText = await chatCompletion({
      url: OPENROUTER_URL,
      apiKey: this.config.apiKey,
      model: this.config.model,
      systemPrompt: request.systemPrompt,
      userMessage: request.sourceText,
      providerLabel: "OpenRouter",
      extraHeaders: { "X-Title": "Perseus" },
    });

    return { translatedText };
  }
}
