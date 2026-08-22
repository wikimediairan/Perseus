import type { TargetWikiCode } from "../config/targetWikis";
import type { IntermediateRepresentation } from "../ir/IntermediateRepresentation";
import type { ArticleRevisionSource } from "../stages/01-input/InputLoader";

export const PACKAGE_FORMAT_MARKER = "perseus-package" as const;
export const CURRENT_FORMAT_VERSION = 1 as const;

export interface TranslationSessionMeta {
  sourceLanguage: string;
  targetWiki: TargetWikiCode;

  exportedAt: string;

  chunkCharBudget: number;
}

export type TranslationSessionSource = ArticleRevisionSource;

export type TranslationEntryTuple = [id: number, tag: string, text: string];

export interface SessionChunk {
  id: string;
  translation: TranslationEntryTuple[];
}

export interface TranslationSession {
  format: typeof PACKAGE_FORMAT_MARKER;
  formatVersion: typeof CURRENT_FORMAT_VERSION;
  meta: TranslationSessionMeta;
  source: TranslationSessionSource;
  chunks: SessionChunk[];
}

export interface SessionProgress {
  translated: number;
  total: number;

  percent: number;
}

export interface ApplySessionChunkResult {
  ir: IntermediateRepresentation;

  appliedCount: number;

  ignoredUnknownIds: string[];
}
