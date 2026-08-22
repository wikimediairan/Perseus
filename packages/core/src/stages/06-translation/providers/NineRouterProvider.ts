import { PerseusError } from "../../../platform/errors/PerseusError";
import { chatCompletion } from "../chatProtocol";
import type {
  TextProviderType,
  TranslationRequest,
  TranslationResponse,
} from "../LLMProvider";

export interface NineRouterProviderConfig {
  apiKey?: string;
  model: string;
  baseUrl: string;
}

function chatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`;
}

export class NineRouterProvider implements TextProviderType {
  readonly kind = "9router";

  constructor(private readonly config: NineRouterProviderConfig) {}

  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    if (!this.config.model) {
      throw new PerseusError(
        "ConfigurationError",
        "No model configured for 9Router.",
        {
          stage: "translation",
        },
      );
    }

    const { content, usage } = await chatCompletion({
      url: chatCompletionsUrl(this.config.baseUrl),
      apiKey: this.config.apiKey,
      model: this.config.model,
      systemPrompt: request.systemPrompt,
      userMessage: request.sourceText,
      providerLabel: "9Router",
    });

    return { translatedText: content, usage };
  }
}
