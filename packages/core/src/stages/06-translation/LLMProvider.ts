import type { TargetWikiCode } from "../../config/targetWikis.js";

export interface TranslationRequest {
  systemPrompt: string;
  sourceText: string;
  targetLanguage: TargetWikiCode;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface TranslationUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;

  cost?: number;
}

export interface TranslationResponse {
  translatedText: string;
  usage?: TranslationUsage;
}

export interface LLMProvider {
  readonly kind: "openrouter" | "9router" | "wikimedia";
}

export interface TextProviderType extends LLMProvider {
  translate(request: TranslationRequest): Promise<TranslationResponse>;
}
