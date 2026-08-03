import { PerseusError } from "@core/platform/errors/PerseusError";
import type {
  TextProviderType,
  TranslationRequest,
  TranslationResponse,
} from "@core/stages/06-translation/LLMProvider";

export interface AnthropicProviderConfig {
  apiKey?: string;
  model: string;
}

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";
const MAX_TOKENS = 4096;

interface AnthropicMessageResponse {
  content?: { type?: string; text?: string }[];
  error?: { message?: string };
}

export class AnthropicProvider implements TextProviderType {
  readonly kind = "anthropic";

  constructor(private readonly config: AnthropicProviderConfig) {}

  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    if (!this.config.apiKey) {
      throw new PerseusError("ConfigurationError", "No API key configured for Anthropic.", {
        stage: "translation",
      });
    }

    if (!this.config.model) {
      throw new PerseusError("ConfigurationError", "No model configured for Anthropic.", {
        stage: "translation",
      });
    }

    let response: Response;

    try {
      response = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.config.apiKey,
          "anthropic-version": ANTHROPIC_API_VERSION,
        },
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: MAX_TOKENS,
          system: request.systemPrompt,
          messages: [{ role: "user", content: request.sourceText }],
        }),
      });
    } catch (error) {
      throw new PerseusError("ProviderError", "Could not reach the Anthropic API.", {
        stage: "translation",
        cause: error,
      });
    }

    const body = (await response.json().catch(() => ({}))) as AnthropicMessageResponse;

    if (!response.ok) {
      throw new PerseusError(
        "ProviderError",
        `Anthropic request failed (HTTP ${response.status}): ${body.error?.message ?? "unknown error"}`,
        { stage: "translation", context: { status: response.status } },
      );
    }

    const translatedText = body.content?.find((block) => block.type === "text")?.text;

    if (!translatedText?.trim()) {
      throw new PerseusError("ProviderError", "Anthropic returned an empty translation.", {
        stage: "translation",
      });
    }

    return { translatedText };
  }
}
