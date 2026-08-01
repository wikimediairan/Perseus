/**
 * wikimedia-provider/contract.ts
 *
 * Wikimedia is a first-class provider, not a variant of the generic
 * text-translation providers in @core/stages/06-translation/providers.
 * Its protocol is shaped completely differently: it operates on a whole
 * article revision (by `pageId`/`revisionId`) and a specific chunk (or
 * "all") of that revision, and can report chunk-level `failed`/`skipped`
 * results — none of which the per-request TextProviderType contract
 * (@core/stages/06-translation/LLMProvider.ts) has any concept of.
 *
 * This is why WikimediaProvider lives in its own top-level module
 * instead of alongside AnthropicProvider/OpenAIProvider/etc.: the built-in
 * translation stage is written against TextProviderType only, and
 * createPipeline deliberately refuses to wire a Wikimedia provider into
 * it (see ProviderFactory.isWikimediaProvider) rather than pretending the
 * two protocols are interchangeable.
 *
 * `WikimediaProviderType` still extends the shared `LLMProvider` base
 * (just the `kind` tag) so ProviderFactory can return one factory result
 * type and callers can branch on `kind`/`isWikimediaProvider` — but the
 * request/response shapes below are entirely Wikimedia's own.
 */

import type { LLMProvider } from "@core/stages/06-translation/LLMProvider";

export type WikimediaRequest = {
  model: string;
  source: {
    wiki: string;
    pageId: number;
    revisionId: number;
  };
  chunk: `chunk-${number}` | "all";
  targetWiki: "fa" | "tj";
};

export interface WikimediaResponse {
  source: {
    wiki: string;
    pageId: number;
    revisionId: number;
  };
  targetWiki: string;
  totalChunks: number;
  translated: {
    chunkId: string;
    units: {
      nodeId: string;
      sourceText: string;
      translatedText: string;
    }[];
  }[];
  failed: {
    chunkId: string;
    reason: "provider_error";
  }[];
  skipped: {
    chunkId: string;
    reason: "quota_exhausted";
  }[];
}

export interface WikimediaProviderType extends LLMProvider {
  translate(request: WikimediaRequest): Promise<WikimediaResponse>;
}
