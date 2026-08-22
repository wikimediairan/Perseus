import type {
  TranslationUnit,
  TranslationWorklist,
} from "../04-extraction/Extractor";

export interface Chunk {
  id: string;
  units: TranslationUnit[];
}

export interface Chunker {
  chunk(worklist: TranslationWorklist): Promise<Chunk[]>;
}

export const DEFAULT_MAX_CHUNK_CHARS = 2500;

export class SizeBoundedChunker implements Chunker {
  constructor(
    private readonly maxChunkChars: number = DEFAULT_MAX_CHUNK_CHARS,
  ) {}

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
