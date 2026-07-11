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

export type { Merger } from '@core/merge/Merger';
export type { LinkNode } from '@core/ir/LinkNode';
export { DEFAULT_CONFIG } from '@core/config/Config';

export { ConsoleLogger } from '@core/logging/Logger';
export { createPipeline } from '@core/createPipeline';

export { createProvider } from '@core/llm/ProviderFactory';
export { SizeBoundedChunker, DEFAULT_MAX_CHUNK_CHARS } from '@core/chunker/Chunker';
export type { Chunk, Chunker } from '@core/chunker/Chunker';

export { FileConfigLoader } from '@core/config/ConfigLoader';
export type { ConfigLoader } from '@core/config/ConfigLoader';

export {
  TARGET_WIKIS,
  getTargetWiki,
  isTargetWikiCode,
  DEFAULT_TARGET_WIKI,
} from '@core/config/targetWikis';
export type { TargetWikiCode, TargetWikiDefinition } from '@core/config/targetWikis';

export { WikipediaInputLoader } from '@core/input/InputLoader';
export type { PromptManager } from '@core/prompt/PromptManager';
export type { OutputDelivery } from '@core/output/OutputDelivery';
export { TauriOutputDelivery } from '@core/output/OutputDelivery';
export { DefaultPromptManager } from '@core/prompt/PromptManager';
export type { Logger, LogEntry, LogLevel } from '@core/logging/Logger';

export { PerseusError, notImplemented } from '@core/errors/PerseusError';
export { Pipeline, PIPELINE_STAGE_ORDER } from '@core/pipeline/Pipeline';

export type { WikitextGenerator } from '@core/generator/WikitextGenerator';
export type {
  PerseusErrorOptions,
  PerseusErrorCategory,
} from '@core/errors/PerseusError';

export type {
  InputLoader,
  ArticleSource,
  LoadedArticle,
} from '@core/input/InputLoader';
export type {
  PromptConfig,
  PerseusConfig,
  LLMProviderConfig,
} from '@core/config/Config';
export type {
  TextNode,
  IntermediateRepresentation,
} from '@core/ir/IntermediateRepresentation';
export type {
  Translator,
} from '@core/translator/Translator';
export {
  SEGMENT_FORMAT_INSTRUCTIONS,
  renderChunkForTranslation,
  parseChunkTranslation,
} from '@core/chunker/segmentProtocol';
export type {
  TranslatedUnit,
  TranslatedChunk,
} from '@core/chunker/segmentProtocol';

export type {
  Extractor,
  TranslationUnit,
  TranslationWorklist,
} from '@core/extractor/Extractor';
export type {
  LLMProvider,
  LLMProviderKind,
  TranslationResult,
  TranslationRequest,
} from '@core/llm/LLMProvider';

export type {
  PipelineResult,
  ExtractionResult,
  PipelineStageName,
  PipelineDependencies,
} from '@core/pipeline/Pipeline';
export type {
  ReferenceAttentionAnnotation,
  ReferenceAttentionClassifier,
  ReferenceAttentionClassification,
} from '@core/referenceAttention/ReferenceAttention';

export {
  applySessionChunk,
  exportTranslationSession,
  validateTranslationSession,
  calculateSessionProgress,
  EXTERNAL_TRANSLATION_INSTRUCTIONS,
} from '@core/translationPackage';
export type {
  SessionChunk,
  SessionProgress,
  TranslationSession,
  TranslationEntryTuple,
  ApplySessionChunkResult,
  TranslationSessionMeta,
  TranslationSessionSnapshot,
  TranslationSessionProvenance,
} from '@core/translationPackage';
