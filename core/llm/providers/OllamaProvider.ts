/**
 * OllamaProvider
 *
 * Real implementation for a local Ollama instance
 * (https://ollama.com), using its `/api/chat` endpoint with
 * `stream: false` so the full response arrives as one JSON body rather
 * than a newline-delimited stream — simpler to consume and consistent
 * with how the other two providers are called.
 */

import { PerseusError } from '@core/errors/PerseusError';
import type {
  LLMProvider,
  LLMProviderKind,
  TranslationResult,
  TranslationRequest,
} from '@core/llm/LLMProvider';


export interface OllamaProviderConfig {
  baseUrl: string,
  model: string,
}

interface OllamaChatResponse {
  message?: { content?: string },
  error?: string,
}

export class OllamaProvider implements LLMProvider {
  readonly kind: LLMProviderKind = 'ollama';

  constructor(private readonly config: OllamaProviderConfig) {}

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    if (!this.config.model) {
      throw new PerseusError(
        'ConfigurationError',
        'No model configured for Ollama.',
        { stage: 'llm-translation' },
      );
    }

    const url = `${this.config.baseUrl.replace(/\/$/, '')}/api/chat`;
    let response: Response;

    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          stream: false,
          messages: [
            { role: 'system', content: request.systemPrompt },
            { role: 'user', content: request.sourceText },
          ],
        }),
      });
    } catch (error) {
      throw new PerseusError(
        'ProviderError',
        `Could not reach Ollama at ${this.config.baseUrl}. Is Ollama running locally?`,
        { stage: 'llm-translation', cause: error },
      );
    }

    const body = (await response
      .json()
      .catch(() => ({}))) as OllamaChatResponse;

    if (!response.ok) {
      throw new PerseusError(
        'ProviderError',
        `Ollama request failed (HTTP ${response.status}): ${body.error ?? 'unknown error'}`,
        { stage: 'llm-translation', context: { status: response.status } },
      );
    }

    const content = body.message?.content;

    if (!content?.trim()) {
      throw new PerseusError(
        'ProviderError',
        'Ollama returned an empty translation.',
        { stage: 'llm-translation' },
      );
    }

    return { translatedText: content };
  }
}
