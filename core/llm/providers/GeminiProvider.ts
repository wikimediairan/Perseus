/**
 * GeminiProvider
 *
 * Real implementation for Google's Gemini API
 * (https://generativelanguage.googleapis.com). Like Anthropic, this
 * doesn't share the OpenAI-style `chatCompletion` helper — Gemini's
 * request shape uses `contents[].parts[].text` rather than a `messages`
 * array, a separate `system_instruction` field rather than a system
 * role, an `x-goog-api-key` header rather than `Authorization: Bearer`,
 * and the model name is part of the URL path rather than a body field.
 * The response is `candidates[0].content.parts[].text`. A dedicated
 * implementation keeps each provider's real wire protocol honest rather
 * than bending a shared helper to fit a third shape.
 */

import { PerseusError } from "@core/errors/PerseusError";
import type {
  LLMProvider,
  LLMProviderKind,
  TranslationRequest,
  TranslationResult,
} from "@core/llm/LLMProvider";

export interface GeminiProviderConfig {
  apiKey?: string;
  model: string;
}

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiGenerateContentResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { message?: string };
}

export class GeminiProvider implements LLMProvider {
  readonly kind: LLMProviderKind = "gemini";

  constructor(private readonly config: GeminiProviderConfig) {}

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    if (!this.config.apiKey) {
      throw new PerseusError("ConfigurationError", "No API key configured for Gemini.", {
        stage: "llm-translation",
      });
    }

    if (!this.config.model) {
      throw new PerseusError("ConfigurationError", "No model configured for Gemini.", {
        stage: "llm-translation",
      });
    }

    const url = `${GEMINI_API_BASE}/${encodeURIComponent(this.config.model)}:generateContent`;

    let response: Response;

    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.config.apiKey,
        },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: request.systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: request.sourceText }] }],
        }),
      });
    } catch (error) {
      throw new PerseusError("ProviderError", "Could not reach the Gemini API.", {
        stage: "llm-translation",
        cause: error,
      });
    }

    const body = (await response.json().catch(() => ({}))) as GeminiGenerateContentResponse;

    if (!response.ok) {
      throw new PerseusError(
        "ProviderError",
        `Gemini request failed (HTTP ${response.status}): ${body.error?.message ?? "unknown error"}`,
        { stage: "llm-translation", context: { status: response.status } },
      );
    }

    const translatedText = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");

    if (!translatedText?.trim()) {
      throw new PerseusError("ProviderError", "Gemini returned an empty translation.", {
        stage: "llm-translation",
      });
    }

    return { translatedText };
  }
}
