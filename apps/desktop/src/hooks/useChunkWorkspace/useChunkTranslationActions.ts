import type {
  Chunk,
  ExtractionResult,
  Logger,
  PerseusConfig,
  TargetWikiCode,
} from "@perseus/core";
import { createPipeline } from "@perseus/core";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { OutputDelivery } from "@/services/OutputDelivery";
import { EMPTY_CHUNK_STATE } from "./types";

type IR = ExtractionResult["ir"];

interface Params {
  configRef: React.RefObject<PerseusConfig>;
  makeLogger(): Logger;
  toUserMessage(err: unknown): string;
  outputDelivery: OutputDelivery;
  chunks: Chunk[] | null;
  targetWiki: TargetWikiCode | null;
  getIr(): IR | null;
  setIr(ir: IR): void;
  getExtraction(): ExtractionResult | null;
}

/** Copy/paste with an external AI and built-in-LLM translation, per chunk or for the whole article, plus the progress they add up to. */
export function useChunkTranslationActions({
  configRef,
  makeLogger,
  toUserMessage,
  outputDelivery,
  chunks,
  targetWiki,
  getIr,
  setIr,
  getExtraction,
}: Params) {
  const { t } = useTranslation();
  const [chunkState, setChunkState] = useState(EMPTY_CHUNK_STATE);
  const [translateAllBusy, setTranslateAllBusy] = useState(false);

  const resetChunkState = useCallback(() => {
    setChunkState(EMPTY_CHUNK_STATE);
  }, []);

  const initializeChunkState = useCallback(
    (translatedByNodeId: Map<string, string>) => {
      setChunkState({
        translatedByNodeId,
        busyChunkIds: new Set(),
        missingByChunkId: new Map(),
      });
    },
    [],
  );

  const copyGeneralPrompt = useCallback(async () => {
    if (!targetWiki) {
      toast.error(t("errors.noTargetWiki"));
      return;
    }

    const { getTargetWiki } = await import("@perseus/core");
    const { DefaultPromptManager } = await import("@perseus/core");

    const promptManager = new DefaultPromptManager();
    const prompt = `${promptManager.buildPrompt(getTargetWiki(targetWiki), configRef.current.prompt.userPrompt)}`;
    await outputDelivery.copyToClipboard(prompt);
    toast.success(t("app.promptCopied"));
  }, [configRef, outputDelivery, t, targetWiki]);

  const copyChunk = useCallback(
    async (chunk: Chunk) => {
      const { renderChunkForTranslation } = await import("@perseus/core");
      await outputDelivery.copyToClipboard(renderChunkForTranslation(chunk));
      toast.success(t("app.chunkCopied"));
    },
    [outputDelivery, t],
  );

  const pasteChunkTranslation = useCallback(
    async (chunk: Chunk, rawText: string) => {
      const ir = getIr();
      if (!ir) {
        return;
      }

      const { parseChunkTranslation } = await import("@perseus/core");

      let units: Awaited<ReturnType<typeof parseChunkTranslation>>["units"];
      let missingUnitIds: string[];

      try {
        ({ units, missingUnitIds } = parseChunkTranslation(chunk, rawText));
      } catch (error_) {
        // ChunkIdentityError (wrong chunk, tampered/stale content, or
        // missing identity metadata — see segmentProtocol.ts): reject
        // outright, exactly per the fail-closed requirement. Never
        // attempt to guess, repair, or partially apply this content.
        toast.error(toUserMessage(error_));
        return;
      }

      if (units.length === 0) {
        toast.error(t("errors.pasteNoMatch"));
        return;
      }

      const pipeline = createPipeline(
        configRef.current,
        makeLogger(),
        getExtraction()?.source,
      );
      setIr(await pipeline.mergeChunk(ir, { id: chunk.id, units }));

      setChunkState((prev) => {
        const translatedByNodeId = new Map(prev.translatedByNodeId);
        for (const unit of units) {
          translatedByNodeId.set(unit.nodeId, unit.translatedText);
        }

        const missingByChunkId = new Map(prev.missingByChunkId);
        if (missingUnitIds.length > 0) {
          missingByChunkId.set(chunk.id, missingUnitIds.length);
          toast.warning(
            t("app.pastePartial", { count: missingUnitIds.length }),
          );
        } else {
          missingByChunkId.delete(chunk.id);
        }

        return { ...prev, translatedByNodeId, missingByChunkId };
      });
    },
    [configRef, getIr, makeLogger, setIr, t, getExtraction, toUserMessage],
  );

  const translateChunkBuiltIn = useCallback(
    async (chunk: Chunk) => {
      const ir = getIr();
      if (!ir) {
        return;
      }

      setChunkState((prev) => ({
        ...prev,
        busyChunkIds: new Set(prev.busyChunkIds).add(chunk.id),
      }));

      try {
        const pipeline = createPipeline(
          configRef.current,
          makeLogger(),
          getExtraction()?.source,
        );
        const translated = await pipeline.translateChunk(chunk);
        setIr(await pipeline.mergeChunk(ir, translated));

        setChunkState((prev) => {
          const translatedByNodeId = new Map(prev.translatedByNodeId);
          for (const unit of translated.units) {
            translatedByNodeId.set(unit.nodeId, unit.translatedText);
          }
          return { ...prev, translatedByNodeId };
        });
      } catch (error_) {
        toast.error(toUserMessage(error_));
        throw error_;
      } finally {
        setChunkState((prev) => {
          const busyChunkIds = new Set(prev.busyChunkIds);
          busyChunkIds.delete(chunk.id);
          return { ...prev, busyChunkIds };
        });
      }
    },
    [configRef, getIr, makeLogger, setIr, toUserMessage, getExtraction],
  );

  const translateAllBuiltIn = useCallback(async () => {
    if (!chunks) {
      return;
    }

    setTranslateAllBusy(true);

    try {
      for (const chunk of chunks) {
        const isDone = chunk.units.every((u) =>
          chunkState.translatedByNodeId.has(u.nodeId),
        );
        if (!isDone) {
          await translateChunkBuiltIn(chunk);
        }
      }
    } catch {
      // translateChunkBuiltIn already toasted a user-facing message for the failing chunk.
    } finally {
      setTranslateAllBusy(false);
    }
  }, [chunks, chunkState.translatedByNodeId, translateChunkBuiltIn]);

  const progress = useMemo(() => {
    const total =
      chunks?.reduce((sum, chunk) => sum + chunk.units.length, 0) ?? 0;
    const translated = chunkState.translatedByNodeId.size;
    return {
      translated,
      total,
      percent: total === 0 ? 0 : Math.round((translated / total) * 100),
    };
  }, [chunks, chunkState.translatedByNodeId]);

  return {
    chunkState,
    progress,
    translateAllBusy,
    resetChunkState,
    initializeChunkState,
    copyGeneralPrompt,
    copyChunk,
    pasteChunkTranslation,
    translateChunkBuiltIn,
    translateAllBuiltIn,
  };
}
