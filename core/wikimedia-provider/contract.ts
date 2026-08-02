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
