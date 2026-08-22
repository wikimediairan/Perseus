import type { SessionProgress, TranslationSession } from "./types";

export function calculateSessionProgress(
  session: Pick<TranslationSession, "chunks">,
  translatedCount: number,
): SessionProgress {
  const total = session.chunks.reduce(
    (sum, chunk) => sum + chunk.translation.length,
    0,
  );
  const percent = total === 0 ? 0 : Math.round((translatedCount / total) * 100);
  return { translated: translatedCount, total, percent };
}
