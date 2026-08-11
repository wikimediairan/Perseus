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
  readonly kind:
    | "gemini"
    | "ollama"
    | "lmstudio"
    | "anthropic"
    | "openrouter"
    | "openai"
    | "wikimedia";
}

export interface TextProviderType extends LLMProvider {
  translate(request: TranslationRequest): Promise<TranslationResponse>;
}
