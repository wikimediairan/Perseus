/**
 * segmentProtocol
 *
 * The ONE render/parse pair for turning a Chunk into translatable text and
 * back. Extracted out of translator/Translator.ts (where this used to be
 * private) so that every executor — the built-in LLM provider AND a human
 * pasting into ChatGPT/Claude/Gemini/etc. — goes through the exact same
 * two functions. That is the whole mechanism behind "the only difference
 * between workflows is who executes the translation": neither function
 * knows or cares who's calling it.
 *
 * Wire format: a chunk's units are combined into ONE piece of text using
 * numbered `[[SEGMENT n]]` markers, so several short paragraphs can be
 * translated together (one round trip, whether that round trip is an API
 * call or a paste into a chat window) while staying individually
 * addressable on the way back.
 */

import type { Chunk } from '@core/chunker/Chunker';

/** The translated result for one TranslationUnit — text only, no structural editing (Spec Section 10). */
export interface TranslatedUnit {
  nodeId: string,
  sourceText: string,
  translatedText: string,
}

/** The translated result for one Chunk — same `id` as the Chunk it came from. */
export interface TranslatedChunk {
  id: string,
  units: TranslatedUnit[],
}

export const SEGMENT_FORMAT_INSTRUCTIONS = [
  'The user message contains one or more numbered segments, each introduced',
  'by a marker on its own line in the exact form "[[SEGMENT n]]" (n is an',
  'integer). Translate the text of every segment. Reproduce',
  'every "[[SEGMENT n]]" marker in your response, unchanged and in the same',
  'order, immediately before the translation of that segment\'s text.',
  'Do not add commentary, explanations, or any segments that were not present',
  'in the input.',
].join(' ');

/** Renders a Chunk as one piece of plain text — the built-in LLM provider's request body, and the exact text a "Copy" button in the UI copies. Single-unit chunks still get one marker, for consistency: the parser doesn't need a special case, and it costs nothing since there is no demultiplexing ambiguity anyway. */
export function renderChunkForTranslation(chunk: Chunk): string {
  return chunk.units
    .map((unit, i) => `[[SEGMENT ${i + 1}]]\n${unit.sourceText}`)
    .join('\n\n');
}

const SEGMENT_PATTERN =
  /\[\[SEGMENT (\d+)\]\]\s*([\s\S]*?)(?=\[\[SEGMENT \d+\]\]|$)/g;

/** Parses a segmented response text (from an LLM provider OR pasted by a human) back into a number -> translated-text map. Exported mainly for testing; callers should use `parseChunkTranslation`. */
export function parseSegmentedText(responseText: string): Map<number, string> {
  const result = new Map<number, string>();

  for (const match of responseText.matchAll(SEGMENT_PATTERN)) {
    const n = Number(match[1]);
    const text = match[2].trim();
    if (text) { result.set(n, text); }
  }

  return result;
}

/**
 * Parses a chunk's translated response (from either executor) back into
 * per-unit translated text, matched by segment number. Segments the
 * response is missing are reported in `missingUnitIds` rather than
 * treated as an all-or-nothing failure — a human pasting a slightly
 * mangled response should still get partial credit for the segments that
 * DID come back correctly (see the Design Proposal, "partial parse
 * failures on paste-back").
 */
export function parseChunkTranslation(
  chunk: Chunk,
  responseText: string,
): { units: TranslatedUnit[], missingUnitIds: string[] } {
  const parsed = parseSegmentedText(responseText);
  const units: TranslatedUnit[] = [];
  const missingUnitIds: string[] = [];

  chunk.units.forEach((unit, index) => {
    const translated = parsed.get(index + 1);

    if (translated) {
      units.push({ nodeId: unit.nodeId, sourceText: unit.sourceText, translatedText: translated });
    } else {
      missingUnitIds.push(unit.nodeId);
    }
  });

  return { units, missingUnitIds };
}
