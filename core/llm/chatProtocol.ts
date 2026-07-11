/**
 * chatProtocol.ts
 *
 * Shared request/response handling for the OpenAI-style chat completions
 * wire protocol, used by both OpenAI and
 * OpenRouterProvider (OpenRouter *is* OpenAI-compatible at the protocol
 * level — sharing this helper avoids duplicating fetch/parsing logic
 * between two classes that would otherwise be identical, without
 * merging them into one class and losing their distinct configuration
 * defaults, per Provider Abstraction).
 */

import { PerseusError } from "@core/errors/PerseusError";

export interface ChatCompletionParams {
  url: string;
  apiKey?: string;
  model: string;
  systemPrompt: string;
  userMessage: string;
  extraHeaders?: Record<string, string>;
  providerLabel: string;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

export async function chatCompletion(params: ChatCompletionParams): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(params.apiKey ? { Authorization: `Bearer ${params.apiKey}` } : {}),
    ...params.extraHeaders,
  };

  let response: Response;

  try {
    response = await fetch(params.url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: params.model,
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: params.userMessage },
        ],
        temperature: 0.3,
      }),
    });
  } catch (error) {
    throw new PerseusError(
      "ProviderError",
      `Could not reach ${params.providerLabel} at ${params.url}.`,
      {
        stage: "llm-translation",
        cause: error,
      },
    );
  }

  const body = (await response.json().catch(() => ({}))) as ChatCompletionResponse;

  if (!response.ok) {
    throw new PerseusError(
      "ProviderError",
      `${params.providerLabel} request failed (HTTP ${response.status}): ${body.error?.message ?? "unknown error"}`,
      { stage: "llm-translation", context: { status: response.status } },
    );
  }

  const content = body.choices?.[0]?.message?.content;

  if (typeof content !== "string" || !content.trim()) {
    throw new PerseusError(
      "ProviderError",
      `${params.providerLabel} returned an empty translation.`,
      {
        stage: "llm-translation",
      },
    );
  }

  return content;
}
