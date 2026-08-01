import type { PerseusConfig } from "@core/config/Config";
import { TauriOutputDelivery } from "@core/output/OutputDelivery";
import { createPipeline } from "@core/pipeline/createPipeline";
import type { ExtractionResult } from "@core/pipeline/Pipeline";
import type { Logger } from "@core/platform/logging/Logger";
import type { ArticleSource } from "@core/stages/01-input/InputLoader";
import type { Chunk } from "@core/stages/05-chunking/Chunker";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type { RunStatus } from "./types";

type IR = ExtractionResult["ir"];

interface Params {
  configRef: React.RefObject<PerseusConfig>;
  makeLogger(): Logger;
  toUserMessage(err: unknown): string;
}

/**
 * Loads an article (live, via `loadArticle`) or a saved session (via
 * `openSession`) and holds the resulting chunk list and mutable IR. Chunk
 * translation progress lives in `useChunkTranslationActions` — this hook
 * only knows how to produce and reconstruct chunks, not how they get
 * translated.
 */
export function useTranslationSession({ configRef, makeLogger, toUserMessage }: Params) {
  const [status, setStatus] = useState<RunStatus>("idle");
  const [chunks, setChunks] = useState<null | Chunk[]>(null);
  const [loadError, setLoadError] = useState<null | string>(null);

  const outputDelivery = useMemo(() => new TauriOutputDelivery(), []);
  const extractionRef = useRef<null | ExtractionResult>(null);
  const irRef = useRef<null | IR>(null);

  const getIr = useCallback(() => irRef.current, []);
  const setIr = useCallback((ir: IR) => {
    irRef.current = ir;
  }, []);
  const getExtraction = useCallback(() => extractionRef.current, []);

  const resetSession = useCallback(() => {
    setLoadError(null);
    setChunks(null);
    extractionRef.current = null;
    irRef.current = null;
  }, []);

  const loadArticle = useCallback(
    async (source: ArticleSource) => {
      resetSession();
      setStatus("extracting");

      try {
        const pipeline = createPipeline(configRef.current, makeLogger());
        const extraction = await pipeline.runToExtraction(source);
        const derivedChunks = await pipeline.deriveChunks(extraction.worklist);

        extractionRef.current = extraction;
        irRef.current = extraction.ir;
        setChunks(derivedChunks);
        setStatus("ready");
      } catch (error_) {
        const message = toUserMessage(error_);
        setLoadError(message);
        toast.error(message);
        setStatus("error");
      }
    },
    [configRef, makeLogger, resetSession, toUserMessage],
  );

  /** Reopens a saved session. Returns the translations it contained (keyed by nodeId) so the caller can seed chunk translation state, or `null` if nothing was opened/loading failed. */
  const openSession = useCallback(async (): Promise<Map<string, string> | null> => {
    resetSession();
    setStatus("extracting");

    try {
      const session = await outputDelivery.openSession();

      if (!session) {
        setStatus("idle");
        return null;
      }

      const pipeline = createPipeline(configRef.current, makeLogger());
      const extraction = await pipeline.reconstructFromRevision(
        session.source,
        session.meta.targetWiki,
      );

      const pristineTextByNodeId = new Map(extraction.ir.textNodes.map((n) => [n.id, n.text]));

      const rebuiltChunks: Chunk[] = session.chunks.map((sessionChunk) => ({
        id: sessionChunk.id,
        units: sessionChunk.translation.map(([numericId]) => {
          const nodeId = `text-${numericId}`;
          return { nodeId, sourceText: pristineTextByNodeId.get(nodeId) ?? "" };
        }),
      }));

      let ir = extraction.ir;
      const translatedByNodeId = new Map<string, string>();

      for (const sessionChunk of session.chunks) {
        const applied = await pipeline.applySessionChunk(ir, sessionChunk);
        ir = applied.ir;

        for (const [numericId, , text] of sessionChunk.translation) {
          const nodeId = `text-${numericId}`;
          if (text !== pristineTextByNodeId.get(nodeId)) {
            translatedByNodeId.set(nodeId, text);
          }
        }
      }

      extractionRef.current = extraction;
      irRef.current = ir;
      setChunks(rebuiltChunks);
      setStatus("ready");
      return translatedByNodeId;
    } catch (error_) {
      const message = toUserMessage(error_);
      setLoadError(message);
      toast.error(message);
      setStatus("error");
      return null;
    }
  }, [configRef, makeLogger, outputDelivery, resetSession, toUserMessage]);

  return {
    status,
    chunks,
    loadError,
    targetWiki: extractionRef.current?.targetWiki ?? null,
    outputDelivery,
    getIr,
    setIr,
    getExtraction,
    loadArticle,
    openSession,
    resetSession,
  };
}
