//? Coordinates the lifecycle of a chunk translation workspace, from article loading to interactive translation

import type { Chunk } from "@core/chunker/Chunker";
import { DEFAULT_MAX_CHUNK_CHARS } from "@core/chunker/Chunker";
import type { PerseusConfig } from "@core/config/Config";
import { createPipeline } from "@core/createPipeline";
import { PerseusError } from "@core/errors/PerseusError";
import type { ArticleSource } from "@core/input/InputLoader";
import type { Logger } from "@core/logging/Logger";
import { TauriOutputDelivery } from "@core/output/OutputDelivery";
import type { ExtractionResult, PipelineStageName } from "@core/pipeline/Pipeline";
import { PIPELINE_STAGE_ORDER } from "@core/pipeline/Pipeline";
import { exportTranslationSession } from "@core/translationPackage/export";
import type { TFunction } from "i18next";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useAsyncAction } from "./useAsyncAction";

export interface LogLine {
  id: string;
  level: "info" | "warn" | "debug" | "error";
  message: string;
}

export type RunStatus = "idle" | "extracting" | "ready" | "error";

export interface ChunkState {
  // Translated text for each unit, keyed by nodeId. Missing entries indicate the unit is still untranslated
  translatedByNodeId: Map<string, string>;
  // Chunk ids currently mid-flight via the built-in executor (for a per-row spinner).
  busyChunkIds: Set<string>;
  // Chunk id -> count of segments a paste-back couldn't match, so the UI can warn without hard-failing (see chunker/segmentProtocol.ts).
  missingByChunkId: Map<string, number>;
}

function toUserMessage(err: unknown, t: TFunction): string {
  if (err instanceof PerseusError) {
    switch (err.category) {
      case "InputError": {
        return err.message;
      }

      case "ParsingError": {
        return t("errors.parsing", { message: err.message });
      }

      case "LinkResolutionError": {
        return t("errors.linkResolution", { message: err.message });
      }

      case "TranslationError": {
        return t("errors.translation", { message: err.message });
      }

      case "MergeError": {
        return t("errors.merge", { message: err.message });
      }

      case "GenerationError": {
        return t("errors.generation", { message: err.message });
      }

      case "ConfigurationError": {
        return t("errors.configuration", { message: err.message });
      }

      case "ProviderError": {
        return t("errors.provider", { message: err.message });
      }

      default: {
        return err.message;
      }
    }
  }

  return t("errors.unexpected");
}

export function useChunkWorkspace(config: PerseusConfig) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<RunStatus>("idle");
  const [currentStage, setCurrentStage] = useState<null | PipelineStageName>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const [loadError, setLoadError] = useState<null | string>(null);

  const [chunks, setChunks] = useState<null | Chunk[]>(null);
  const [chunkState, setChunkState] = useState<ChunkState>({
    translatedByNodeId: new Map(),
    busyChunkIds: new Set(),
    missingByChunkId: new Map(),
  });
  const [translateAllBusy, setTranslateAllBusy] = useState(false);

  const [wikitext, setWikitext] = useState<null | string>(null);

  const outputDelivery = useMemo(() => new TauriOutputDelivery(), []);
  const configRef = useRef(config);
  configRef.current = config;
  const extractionRef = useRef<null | ExtractionResult>(null);
  const irRef = useRef<null | ExtractionResult["ir"]>(null);

  const toUserMessageBound = useCallback((err: unknown) => toUserMessage(err, t), [t]);

  const makeLogger = useCallback((): Logger => {
    const append = (level: LogLine["level"], message: string, stage?: PipelineStageName) => {
      if (stage) {
        setCurrentStage(stage);
      }

      setLog((prev) => [
        ...prev,
        { id: crypto.randomUUID(), level, message: stage ? `${stage}: ${message}` : message },
      ]);
    };

    const build = (stage?: PipelineStageName): Logger => ({
      debug: (m) => {
        append("debug", m, stage);
      },
      info: (m) => {
        append("info", m, stage);
      },
      warn: (m) => {
        append("warn", m, stage);
      },
      error: (m) => {
        append("error", m, stage);
      },
      forStage: (s) => build(s),
    });
    return build();
  }, []);

  const resetAll = useCallback(() => {
    setLoadError(null);
    setCurrentStage(null);
    setLog([]);
    setChunks(null);
    setChunkState({
      translatedByNodeId: new Map(),
      busyChunkIds: new Set(),
      missingByChunkId: new Map(),
    });
    setWikitext(null);
    extractionRef.current = null;
    irRef.current = null;
  }, []);

  const loadArticle = useCallback(
    async (source: ArticleSource) => {
      resetAll();
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
        const message = toUserMessageBound(error_);
        setLoadError(message);
        toast.error(message);
        setStatus("error");
      }
    },
    [makeLogger, resetAll, toUserMessageBound],
  );

  const openSession = useCallback(async () => {
    resetAll();
    setStatus("extracting");

    try {
      const session = await outputDelivery.openSession();

      if (!session) {
        setStatus("idle");
        return;
      }

      const pipeline = createPipeline(configRef.current, makeLogger());
      const extraction = await pipeline.reconstructFromSnapshot(
        session.snapshot.parsoidHtml,
        session.provenance.rawWikitext,
        session.meta.articleTitle,
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
      setChunkState({ translatedByNodeId, busyChunkIds: new Set(), missingByChunkId: new Map() });
      setStatus("ready");
    } catch (error_) {
      const message = toUserMessageBound(error_);
      setLoadError(message);
      toast.error(message);
      setStatus("error");
    }
  }, [makeLogger, outputDelivery, resetAll, toUserMessageBound]);

  const copyGeneralPrompt = useCallback(async () => {
    const targetWiki = extractionRef.current?.targetWiki;
    if (!targetWiki) {
      toast.error(t("errors.noTargetWiki"));
      return;
    }

    const { getTargetWiki } = await import("@core/config/targetWikis");
    const { DefaultPromptManager } = await import("@core/prompt/PromptManager");
    const { SEGMENT_FORMAT_INSTRUCTIONS } = await import("@core/chunker/segmentProtocol");

    const promptManager = new DefaultPromptManager();
    const prompt = `${promptManager.buildPrompt(getTargetWiki(targetWiki), configRef.current.prompt.userPrompt)}\n\n${SEGMENT_FORMAT_INSTRUCTIONS}`;
    await outputDelivery.copyToClipboard(prompt);
    toast.success(t("app.promptCopied"));
  }, [outputDelivery, t]);

  const copyChunk = useCallback(
    async (chunk: Chunk) => {
      const { renderChunkForTranslation } = await import("@core/chunker/segmentProtocol");
      await outputDelivery.copyToClipboard(renderChunkForTranslation(chunk));
      toast.success(t("app.chunkCopied"));
    },
    [outputDelivery, t],
  );

  const pasteChunkTranslation = useCallback(
    async (chunk: Chunk, rawText: string) => {
      if (!irRef.current) {
        return;
      }

      const { parseChunkTranslation } = await import("@core/chunker/segmentProtocol");
      const { units, missingUnitIds } = parseChunkTranslation(chunk, rawText);

      if (units.length === 0) {
        toast.error(t("errors.pasteNoMatch"));
        return;
      }

      const pipeline = createPipeline(configRef.current, makeLogger());
      irRef.current = await pipeline.mergeChunk(irRef.current, { id: chunk.id, units });

      setChunkState((prev) => {
        const translatedByNodeId = new Map(prev.translatedByNodeId);
        for (const unit of units) {
          translatedByNodeId.set(unit.nodeId, unit.translatedText);
        }

        const missingByChunkId = new Map(prev.missingByChunkId);
        if (missingUnitIds.length > 0) {
          missingByChunkId.set(chunk.id, missingUnitIds.length);
          toast.warning(t("app.pastePartial", { count: missingUnitIds.length }));
        } else {
          missingByChunkId.delete(chunk.id);
        }

        return { ...prev, translatedByNodeId, missingByChunkId };
      });
    },
    [makeLogger, t],
  );

  const translateChunkBuiltIn = useCallback(
    async (chunk: Chunk) => {
      if (!irRef.current) {
        return;
      }

      setChunkState((prev) => ({
        ...prev,
        busyChunkIds: new Set(prev.busyChunkIds).add(chunk.id),
      }));

      try {
        const pipeline = createPipeline(configRef.current, makeLogger());
        const translated = await pipeline.translateChunk(chunk);
        irRef.current = await pipeline.mergeChunk(irRef.current, translated);

        setChunkState((prev) => {
          const translatedByNodeId = new Map(prev.translatedByNodeId);
          for (const unit of translated.units) {
            translatedByNodeId.set(unit.nodeId, unit.translatedText);
          }
          return { ...prev, translatedByNodeId };
        });
      } catch (error_) {
        toast.error(toUserMessageBound(error_));
        throw error_;
      } finally {
        setChunkState((prev) => {
          const busyChunkIds = new Set(prev.busyChunkIds);
          busyChunkIds.delete(chunk.id);
          return { ...prev, busyChunkIds };
        });
      }
    },
    [makeLogger, toUserMessageBound],
  );

  const translateAllBuiltIn = useCallback(async () => {
    if (!chunks) {
      return;
    }

    setTranslateAllBusy(true);

    try {
      for (const chunk of chunks) {
        const isDone = chunk.units.every((u) => chunkState.translatedByNodeId.has(u.nodeId));
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

  const generateAction = useAsyncAction(async () => {
    if (!irRef.current) {
      return;
    }

    const pipeline = createPipeline(configRef.current, makeLogger());
    await pipeline.classifyReferenceAttention(irRef.current);
    const text = await pipeline.generateWikitext(irRef.current);
    setWikitext(text);
  }, toUserMessageBound);

  const saveSession = useCallback(
    async (suggestedName: string) => {
      if (!extractionRef.current || !chunks || !irRef.current) {
        return null;
      }

      const session = exportTranslationSession(
        { ...extractionRef.current, ir: irRef.current },
        chunks,
        DEFAULT_MAX_CHUNK_CHARS,
      );

      return outputDelivery.saveSession(session, suggestedName);
    },
    [chunks, outputDelivery],
  );

  const progress = useMemo(() => {
    const total = chunks?.reduce((sum, chunk) => sum + chunk.units.length, 0) ?? 0;
    const translated = chunkState.translatedByNodeId.size;
    return { translated, total, percent: total === 0 ? 0 : Math.round((translated / total) * 100) };
  }, [chunks, chunkState.translatedByNodeId]);

  const copyToClipboard = useCallback(async () => {
    if (wikitext) {
      await outputDelivery.copyToClipboard(wikitext);
    }
  }, [wikitext, outputDelivery]);

  const saveToFile = useCallback(
    async (suggestedName: string) =>
      wikitext ? outputDelivery.saveToFile(wikitext, suggestedName) : null,
    [wikitext, outputDelivery],
  );

  return {
    status,
    currentStage,
    log,
    loadError,
    stages: PIPELINE_STAGE_ORDER,

    chunks,
    chunkState,
    progress,
    targetWiki: extractionRef.current?.targetWiki ?? null,

    translateAllBusy,

    wikitext,
    generateBusy: generateAction.busy,

    loadArticle,
    openSession,
    saveSession,
    copyGeneralPrompt,
    copyChunk,
    pasteChunkTranslation,
    translateChunkBuiltIn,
    translateAllBuiltIn,
    generateWikitext: generateAction.run,
    copyToClipboard,
    saveToFile,
  };
}
