import type { TargetWikiCode } from "@core/config/targetWikis";

export interface TranslationRequest {
  systemPrompt: string;
  sourceText: string;
  targetLanguage: TargetWikiCode;
}

export interface TranslationResponse {
  translatedText: string;
}

export interface LLMProvider {
  readonly kind: "gemini" | "ollama" | "anthropic" | "openrouter" | "openai" | "wikimedia";
}

export interface TextProviderType extends LLMProvider {
  translate(request: TranslationRequest): Promise<TranslationResponse>;
}

// Wikimedia's request/response contract does NOT live here. It is a
// completely different (whole-document, chunk-oriented) protocol from
// the per-request TranslationRequest/TranslationResponse pair above —
// see @core/wikimedia-provider/contract.ts. Only the `"wikimedia"` tag in
// the shared `kind` union above acknowledges its existence at all.
