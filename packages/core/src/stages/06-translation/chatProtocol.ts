import { PerseusError } from "../../platform/errors/PerseusError.js";
import type { TranslationUsage } from "./LLMProvider.js";

export interface ChatCompletionParams {
  url: string;
  apiKey?: string;
  model: string;
  systemPrompt: string;
  userMessage: string;
  extraHeaders?: Record<string, string>;
  providerLabel: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ChatCompletionResult {
  content: string;
  usage?: TranslationUsage;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number;
  };
  error?: { message?: string };
}

function extractUsage(
  body: ChatCompletionResponse,
): TranslationUsage | undefined {
  const usageBody = body.usage;
  if (!usageBody) return undefined;

  const hasTokenCounts =
    typeof usageBody.prompt_tokens === "number" &&
    typeof usageBody.completion_tokens === "number" &&
    typeof usageBody.total_tokens === "number";

  if (!hasTokenCounts) return undefined;

  return {
    promptTokens: usageBody.prompt_tokens as number,
    completionTokens: usageBody.completion_tokens as number,
    totalTokens: usageBody.total_tokens as number,
    ...(typeof usageBody.cost === "number" ? { cost: usageBody.cost } : {}),
  };
}

export async function chatCompletion(
  params: ChatCompletionParams,
): Promise<ChatCompletionResult> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(params.apiKey ? { Authorization: `Bearer ${params.apiKey}` } : {}),
    ...params.extraHeaders,
  };

  const controller = new AbortController();
  const abort = (): void => controller.abort();
  params.signal?.addEventListener("abort", abort, { once: true });
  if (params.signal?.aborted) abort();
  const timeout =
    params.timeoutMs && params.timeoutMs > 0
      ? setTimeout(abort, params.timeoutMs)
      : null;
  let response: Response;
  let body: ChatCompletionResponse;
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
      signal: controller.signal,
    });
    body = (await response.json().catch(() => ({}))) as ChatCompletionResponse;
  } catch (error) {
    throw new PerseusError(
      "ProviderError",
      controller.signal.aborted
        ? `${params.providerLabel} request was cancelled or timed out.`
        : `Could not reach ${params.providerLabel}.`,
      {
        stage: "translation",
        cause: error,
      },
    );
  } finally {
    if (timeout) clearTimeout(timeout);
    params.signal?.removeEventListener("abort", abort);
  }

  if (!response.ok) {
    throw new PerseusError(
      "ProviderError",
      `${params.providerLabel} request failed (HTTP ${response.status}).`,
      { stage: "translation", context: { status: response.status } },
    );
  }

  const content = body.choices?.[0]?.message?.content;

  if (typeof content !== "string" || !content.trim()) {
    throw new PerseusError(
      "ProviderError",
      `${params.providerLabel} returned an empty translation.`,
      {
        stage: "translation",
      },
    );
  }

  return { content, usage: extractUsage(body) };
}
