/**
 * translationPackage/index.ts
 *
 * Barrel for the Translation Session module: types, export (save),
 * validate, import (apply), and progress calculation. One supported
 * format — see types.ts for the versioning policy.
 */
export { calculateSessionProgress } from "@core/translationPackage/progress";
export { CURRENT_FORMAT_VERSION, PACKAGE_FORMAT_MARKER } from "@core/translationPackage/types";
export { validateTranslationSession } from "@core/translationPackage/validate";
export { applySessionChunk } from "@core/translationPackage/import";
export {
  exportTranslationSession,
  EXTERNAL_TRANSLATION_INSTRUCTIONS,
} from "@core/translationPackage/export";
export type {
  SessionChunk,
  SessionProgress,
  TranslationSession,
  TranslationEntryTuple,
  ApplySessionChunkResult,
  TranslationSessionMeta,
  TranslationSessionSnapshot,
  TranslationSessionProvenance,
} from "@core/translationPackage/types";
