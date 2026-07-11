/**
 * Translation Session — progress
 *
 * Purely informational, and purely a computed VIEW — never persisted.
 * "Translated" can only be known by comparing a chunk's current tuples
 * against the reconstructed IR's original text, which
 * `applySessionChunk` already does as a side effect of applying each
 * chunk. This function just turns an accumulated changed-count into the
 * {translated, total, percent} shape shown in the UI. This is
 * deliberately NOT a persisted "chunk status" field — see the Design
 * Proposal's scope note on why chunk status tracking stays out of scope
 * while this diff-based progress view stays in (it's the same mechanism
 * Merge already depends on, not a new tracked concept).
 */
import type { SessionProgress, TranslationSession } from "@core/translationPackage/types";

export function calculateSessionProgress(
  session: Pick<TranslationSession, "chunks">,
  translatedCount: number,
): SessionProgress {
  const total = session.chunks.reduce((sum, chunk) => sum + chunk.translation.length, 0);
  const percent = total === 0 ? 0 : Math.round((translatedCount / total) * 100);
  return { translated: translatedCount, total, percent };
}
