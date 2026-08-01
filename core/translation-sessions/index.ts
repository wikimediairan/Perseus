/**
 * translation-sessions/index.ts
 *
 * Barrel for the Translation Session module: types, export (save),
 * validate, import (apply), and progress calculation. One supported
 * format — see types.ts for the versioning policy.
 */

export {
  EXTERNAL_TRANSLATION_INSTRUCTIONS,
  exportTranslationSession,
} from "@core/translation-sessions/export";
export { applySessionChunk } from "@core/translation-sessions/import";
export { calculateSessionProgress } from "@core/translation-sessions/progress";
export type {
  ApplySessionChunkResult,
  SessionChunk,
  SessionProgress,
  TranslationEntryTuple,
  TranslationSession,
  TranslationSessionMeta,
  TranslationSessionSource,
} from "@core/translation-sessions/types";
export { CURRENT_FORMAT_VERSION, PACKAGE_FORMAT_MARKER } from "@core/translation-sessions/types";
export { validateTranslationSession } from "@core/translation-sessions/validate";
