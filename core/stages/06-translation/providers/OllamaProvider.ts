import { PerseusError } from "@core/platform/errors/PerseusError";
import type {
  TextProviderType,
  TranslationRequest,
  TranslationResponse,
} from "@core/stages/06-translation/LLMProvider";

export interface OllamaProviderConfig {
  baseUrl: string;
  model: string;
}

interface OllamaChatResponse {
  message?: { content?: string };
  error?: string;
}

export class OllamaProvider implements TextProviderType {
  readonly kind = "ollama";

  constructor(private readonly config: OllamaProviderConfig) {}

  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    if (!this.config.model) {
      throw new PerseusError("ConfigurationError", "No model configured for Ollama.", {
        stage: "translation",
      });
    }

    const url = `${this.config.baseUrl.replace(/\/$/, "")}/api/chat`;
    let response: Response;

    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.config.model,
          stream: false,
          messages: [
            { role: "system", content: request.systemPrompt },
            { role: "user", content: request.sourceText },
          ],
        }),
      });
    } catch (error) {
      throw new PerseusError(
        "ProviderError",
        `Could not reach Ollama at ${this.config.baseUrl}. Is Ollama running locally?`,
        { stage: "translation", cause: error },
      );
    }

    const body = (await response.json().catch(() => ({}))) as OllamaChatResponse;

    if (!response.ok) {
      throw new PerseusError(
        "ProviderError",
        `Ollama request failed (HTTP ${response.status}): ${body.error ?? "unknown error"}`,
        { stage: "translation", context: { status: response.status } },
      );
    }

    const content = body.message?.content;

    if (!content?.trim()) {
      throw new PerseusError("ProviderError", "Ollama returned an empty translation.", {
        stage: "translation",
      });
    }

    return { translatedText: content };
  }
}
