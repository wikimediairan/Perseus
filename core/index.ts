/**
 * core/index.ts
 *
 * Public entry point for the Perseus core engine. The React/Tauri
 * frontend should import from here rather than reaching into individual
 * module files directly, so the boundary between "core engine" and "UI
 * shell" stays explicit and enforceable.
 *
 * `createPipeline()` is the composition root: given a PerseusConfig, it
 * assembles a fully wired, real (non-stub) Pipeline.
 */

export type { Chunk, Chunker } from "@core/chunker/Chunker";
export { DEFAULT_MAX_CHUNK_CHARS, SizeBoundedChunker } from "@core/chunker/Chunker";
export type { TranslatedChunk, TranslatedUnit } from "@core/chunker/segmentProtocol";
export {
  parseChunkTranslation,
  renderChunkForTranslation,
  SEGMENT_FORMAT_INSTRUCTIONS,
} from "@core/chunker/segmentProtocol";
export type { LLMProviderConfig, PerseusConfig, PromptConfig } from "@core/config/Config";
export { DEFAULT_CONFIG } from "@core/config/Config";
export type { ConfigLoader } from "@core/config/ConfigLoader";
export { FileConfigLoader } from "@core/config/ConfigLoader";
export type { TargetWikiCode, TargetWikiDefinition } from "@core/config/targetWikis";
export {
  DEFAULT_TARGET_WIKI,
  getTargetWiki,
  isTargetWikiCode,
  TARGET_WIKIS,
} from "@core/config/targetWikis";
export { createPipeline } from "@core/createPipeline";
export type { PerseusErrorCategory, PerseusErrorOptions } from "@core/errors/PerseusError";
export { notImplemented, PerseusError } from "@core/errors/PerseusError";
export type { Extractor, TranslationUnit, TranslationWorklist } from "@core/extractor/Extractor";
export type { WikitextGenerator } from "@core/generator/WikitextGenerator";
export type { ArticleSource, InputLoader, LoadedArticle } from "@core/input/InputLoader";
export { WikipediaInputLoader } from "@core/input/InputLoader";
export type { IntermediateRepresentation, TextNode } from "@core/ir/IntermediateRepresentation";
export type { LinkNode } from "@core/ir/LinkNode";
export type {
  LLMProvider,
  LLMProviderKind,
  TranslationRequest,
  TranslationResult,
} from "@core/llm/LLMProvider";
export { createProvider } from "@core/llm/ProviderFactory";
export type { LogEntry, Logger, LogLevel } from "@core/logging/Logger";
export { ConsoleLogger } from "@core/logging/Logger";
export type { Merger } from "@core/merge/Merger";
export type { OutputDelivery } from "@core/output/OutputDelivery";
export { TauriOutputDelivery } from "@core/output/OutputDelivery";
export type {
  ExtractionResult,
  PipelineDependencies,
  PipelineResult,
  PipelineStageName,
} from "@core/pipeline/Pipeline";
export { PIPELINE_STAGE_ORDER, Pipeline } from "@core/pipeline/Pipeline";
export type { PromptManager } from "@core/prompt/PromptManager";
export { DefaultPromptManager } from "@core/prompt/PromptManager";
export type {
  ReferenceAttentionAnnotation,
  ReferenceAttentionClassification,
  ReferenceAttentionClassifier,
} from "@core/referenceAttention/ReferenceAttention";
export type {
  ApplySessionChunkResult,
  SessionChunk,
  SessionProgress,
  TranslationEntryTuple,
  TranslationSession,
  TranslationSessionMeta,
  TranslationSessionProvenance,
  TranslationSessionSnapshot,
} from "@core/translationPackage";

export {
  applySessionChunk,
  calculateSessionProgress,
  EXTERNAL_TRANSLATION_INSTRUCTIONS,
  exportTranslationSession,
  validateTranslationSession,
} from "@core/translationPackage";
export type { Translator } from "@core/translator/Translator";
