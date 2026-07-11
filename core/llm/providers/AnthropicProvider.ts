/**
 * AnthropicProvider
 *
 * Real implementation for the Anthropic Messages API
 * (https://api.anthropic.com/v1/messages). Not built on the shared
 * `chatCompletion` helper (core/llm/chatProtocol.ts) — that helper is
 * specifically the OpenAI-style wire protocol (a "system" role inside
 * `messages`, `choices[0].message.content` in the response), and
 * Anthropic's API has a different shape on both ends: `system` is a
 * top-level field rather than a message, authentication is an
 * `x-api-key` header rather than `Authorization: Bearer`, a required
 * `anthropic-version` header, and the response is a `content` array of
 * typed blocks rather than a single message string. Reusing the OpenAI
 * helper here would mean forcing a second protocol through the wrong
 * abstraction; a small dedicated implementation is simpler and clearer,
 * per Provider Abstraction (Spec 11) — the pipeline only ever sees the
 * common `LLMProvider` interface regardless.
 */

import { PerseusError } from "@core/errors/PerseusError";
import type {
  LLMProvider,
  LLMProviderKind,
  TranslationResult,
  TranslationRequest,
} from "@core/llm/LLMProvider";

export interface AnthropicProviderConfig {
  apiKey?: string;
  model: string;
}

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";
/** Generous enough for a single chunk's worth of translated prose; chunking already bounds request size (see chunker/Chunker.ts). */
const MAX_TOKENS = 4096;

interface AnthropicMessageResponse {
  content?: { type?: string; text?: string }[];
  error?: { message?: string };
}

export class AnthropicProvider implements LLMProvider {
  readonly kind: LLMProviderKind = "anthropic";

  constructor(private readonly config: AnthropicProviderConfig) {}

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    if (!this.config.apiKey) {
      throw new PerseusError("ConfigurationError", "No API key configured for Anthropic.", {
        stage: "llm-translation",
      });
    }

    if (!this.config.model) {
      throw new PerseusError("ConfigurationError", "No model configured for Anthropic.", {
        stage: "llm-translation",
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
        stage: "llm-translation",
        cause: error,
      });
    }

    const body = (await response.json().catch(() => ({}))) as AnthropicMessageResponse;

    if (!response.ok) {
      throw new PerseusError(
        "ProviderError",
        `Anthropic request failed (HTTP ${response.status}): ${body.error?.message ?? "unknown error"}`,
        { stage: "llm-translation", context: { status: response.status } },
      );
    }

    const translatedText = body.content?.find((block) => block.type === "text")?.text;

    if (!translatedText?.trim()) {
      throw new PerseusError("ProviderError", "Anthropic returned an empty translation.", {
        stage: "llm-translation",
      });
    }

    return { translatedText };
  }
}
