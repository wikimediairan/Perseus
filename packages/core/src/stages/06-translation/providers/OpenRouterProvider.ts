import { PerseusError } from "../../../platform/errors/PerseusError";
import { chatCompletion } from "../chatProtocol";
import type {
  TextProviderType,
  TranslationRequest,
  TranslationResponse,
} from "../LLMProvider";

export interface OpenRouterProviderConfig {
  apiKey?: string;
  model: string;
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export class OpenRouterProvider implements TextProviderType {
  readonly kind = "openrouter";

  constructor(private readonly config: OpenRouterProviderConfig) {}

  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    if (!this.config.apiKey) {
      throw new PerseusError(
        "ConfigurationError",
        "No API key configured for OpenRouter.",
        {
          stage: "translation",
        },
      );
    }

    if (!this.config.model) {
      throw new PerseusError(
        "ConfigurationError",
        "No model configured for OpenRouter.",
        {
          stage: "translation",
        },
      );
    }

    const { content, usage } = await chatCompletion({
      url: OPENROUTER_URL,
      apiKey: this.config.apiKey,
      model: this.config.model,
      systemPrompt: request.systemPrompt,
      userMessage: request.sourceText,
      providerLabel: "OpenRouter",
      extraHeaders: { "X-Title": "Perseus" },
    });

    return { translatedText: content, usage };
  }
}
