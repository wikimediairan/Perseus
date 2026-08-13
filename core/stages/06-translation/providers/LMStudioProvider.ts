import { PerseusError } from "@core/platform/errors/PerseusError";
import type {
  TextProviderType,
  TranslationRequest,
  TranslationResponse,
} from "@core/stages/06-translation/LLMProvider";

export interface LMStudioProviderConfig {
  baseUrl: string;
  model: string;
}

interface LMStudioChatResponse {
  output?: { type?: string; content?: string }[];
  error?: string;
  stats?: {
    input_tokens?: number;
    total_output_tokens?: number;
    tokens_per_second?: number;
    time_to_first_token_seconds?: number;
    model_load_time_seconds?: number;
  };
}

export class LMStudioProvider implements TextProviderType {
  readonly kind = "lmstudio";

  constructor(private readonly config: LMStudioProviderConfig) {}

  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    if (!this.config.model) {
      throw new PerseusError("ConfigurationError", "No model configured for LM Studio.", {
        stage: "translation",
      });
    }

    const baseUrl = this.config.baseUrl.replace(/\/$/, "");
    const url = `${baseUrl}/api/v1/chat`;
    let response: Response;

    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.config.model,
          input: request.sourceText,
          system_prompt: request.systemPrompt,
          // Disable reasoning for faster deterministic translation latency.
          reasoning: "off",
          stream: false,
          temperature: 0.3,
        }),
      });
    } catch (error) {
      throw new PerseusError("ProviderError", `Could not reach LM Studio at ${url}.`, {
        stage: "translation",
        cause: error,
      });
    }

    const body = (await response.json().catch(() => ({}))) as LMStudioChatResponse;

    if (!response.ok) {
      throw new PerseusError(
        "ProviderError",
        `LM Studio request failed (HTTP ${response.status}): ${body.error ?? "unknown error"}`,
        {
          stage: "translation",
          context: {
            status: response.status,
            stats: body.stats,
          },
        },
      );
    }

    const content = body.output?.find((item) => item.type === "message")?.content;

    if (typeof content !== "string" || !content.trim()) {
      throw new PerseusError("ProviderError", "LM Studio returned an empty translation.", {
        stage: "translation",
      });
    }

    return { translatedText: content };
  }
}
