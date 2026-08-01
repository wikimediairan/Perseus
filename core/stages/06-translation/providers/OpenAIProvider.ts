import { PerseusError } from "@core/platform/errors/PerseusError";
import { chatCompletion } from "@core/stages/06-translation/chatProtocol";
import type {
  TextProviderType,
  TranslationRequest,
  TranslationResponse,
} from "@core/stages/06-translation/LLMProvider";

export interface OpenAIProviderConfig {
  apiKey?: string;
  model: string;
}

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export class OpenAIProvider implements TextProviderType {
  readonly kind = "openai";

  constructor(private readonly config: OpenAIProviderConfig) {}

  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    if (!this.config.apiKey) {
      throw new PerseusError("ConfigurationError", "No API key configured for OpenAI.", {
        stage: "llm-translation",
      });
    }

    if (!this.config.model) {
      throw new PerseusError("ConfigurationError", "No model configured for OpenAI.", {
        stage: "llm-translation",
      });
    }

    const translatedText = await chatCompletion({
      url: OPENAI_URL,
      apiKey: this.config.apiKey,
      model: this.config.model,
      systemPrompt: request.systemPrompt,
      userMessage: request.sourceText,
      providerLabel: "OpenAI",
    });

    return { translatedText };
  }
}
