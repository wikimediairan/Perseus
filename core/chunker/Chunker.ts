/**
 * Chunker
 *
 * Real implementation. Groups a TranslationWorklist into Chunks bounded
 * by a character budget, so a single LLM request stays within a
 * reasonable context size (Software Specification, Chunking). A single
 * TranslationUnit is never split across chunks — see Risk R-4
 * (chunk-boundary context loss): keeping whole units together in this
 * simple size-based strategy avoids introducing NEW boundary problems
 * inside a single sentence, even though boundaries between paragraphs
 * remain a known limitation (documented in the README).
 */

import type { TranslationUnit, TranslationWorklist } from "@core/extractor/Extractor";

export interface Chunk {
  id: string;
  units: TranslationUnit[];
}

export interface Chunker {
  chunk(worklist: TranslationWorklist): Promise<Chunk[]>;
}

/** Roughly bounds the combined size of one LLM request's translatable text. Conservative default suitable for most local/hosted models. */
export const DEFAULT_MAX_CHUNK_CHARS = 2500;

export class SizeBoundedChunker implements Chunker {
  constructor(private readonly maxChunkChars: number = DEFAULT_MAX_CHUNK_CHARS) {}

  async chunk(worklist: TranslationWorklist): Promise<Chunk[]> {
    const chunks: Chunk[] = [];
    let current: TranslationUnit[] = [];
    let currentSize = 0;
    let chunkIndex = 0;

    const flush = () => {
      if (current.length > 0) {
        chunks.push({ id: `chunk-${++chunkIndex}`, units: current });
        current = [];
        currentSize = 0;
      }
    };

    for (const unit of worklist) {
      const size = unit.sourceText.length;

      if (current.length > 0 && currentSize + size > this.maxChunkChars) {
        flush();
      }

      current.push(unit);
      currentSize += size;
    }

    flush();

    return chunks;
  }
}
