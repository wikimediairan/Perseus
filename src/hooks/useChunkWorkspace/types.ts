export type RunStatus = "idle" | "extracting" | "ready" | "error";

export interface LogLine {
  id: string;
  level: "info" | "warn" | "debug" | "error";
  message: string;
}

export interface ChunkState {
  /** Translated text for each unit, keyed by nodeId. Missing entries indicate the unit is still untranslated. */
  translatedByNodeId: Map<string, string>;
  /** Chunk ids currently mid-flight via the built-in executor (for a per-row spinner). */
  busyChunkIds: Set<string>;
  /** Chunk id -> count of segments a paste-back couldn't match, so the UI can warn without hard-failing (see chunker/segmentProtocol.ts). */
  missingByChunkId: Map<string, number>;
}

export const EMPTY_CHUNK_STATE: ChunkState = {
  translatedByNodeId: new Map(),
  busyChunkIds: new Set(),
  missingByChunkId: new Map(),
};
