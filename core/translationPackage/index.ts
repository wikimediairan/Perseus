/**
 * translationPackage/index.ts
 *
 * Barrel for the Translation Session module: types, export (save),
 * validate, import (apply), and progress calculation. One supported
 * format — see types.ts for the versioning policy.
 */

export {
  EXTERNAL_TRANSLATION_INSTRUCTIONS,
  exportTranslationSession,
} from "@core/translationPackage/export";
export { applySessionChunk } from "@core/translationPackage/import";
export { calculateSessionProgress } from "@core/translationPackage/progress";
export type {
  ApplySessionChunkResult,
  SessionChunk,
  SessionProgress,
  TranslationEntryTuple,
  TranslationSession,
  TranslationSessionMeta,
  TranslationSessionProvenance,
  TranslationSessionSnapshot,
} from "@core/translationPackage/types";
export { CURRENT_FORMAT_VERSION, PACKAGE_FORMAT_MARKER } from "@core/translationPackage/types";
export { validateTranslationSession } from "@core/translationPackage/validate";
