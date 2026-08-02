/**
 * useChunkWorkspace
 *
 * Coordinates the lifecycle of a chunk translation workspace, from article
 * loading to interactive translation. Composed from four focused hooks,
 * each owning one concern:
 *
 *   - useUiLogger              the pipeline run log + current stage
 *   - useTranslationSession    loading an article/session, chunks, the IR
 *   - useChunkTranslationActions   per-chunk translation progress & actions
 *   - useWikitextOutput        generated Wikitext + its delivery actions
 *
 * This hook only sequences the cross-cutting bits (resetting the log and
 * generated Wikitext when a new load starts; seeding chunk translation
 * state from a reopened session) and re-exports what `App.tsx` needs as a
 * single flat surface, preserving the previous public shape of
 * `useChunkWorkspace`.
 */

import type { PerseusConfig } from "@core/config/Config";
import { PIPELINE_STAGE_ORDER } from "@core/pipeline/Pipeline";
import type { ArticleSource } from "@core/stages/01-input/InputLoader";
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";

import { toUserMessage as toUserMessageImpl } from "./errorMessages";
import { useChunkTranslationActions } from "./useChunkTranslationActions";
import { useTranslationSession } from "./useTranslationSession";
import { useUiLogger } from "./useUiLogger";
import { useWikitextOutput } from "./useWikitextOutput";

export type { ChunkState, LogLine, RunStatus } from "./types";

export function useChunkWorkspace(config: PerseusConfig) {
  const { t } = useTranslation();

  const configRef = useRef(config);
  configRef.current = config;

  const toUserMessage = useCallback((err: unknown) => toUserMessageImpl(err, t), [t]);

  const { log, currentStage, makeLogger, resetLog } = useUiLogger();

  const session = useTranslationSession({
    configRef,
    makeLogger,
    toUserMessage,
  });

  const chunkActions = useChunkTranslationActions({
    configRef,
    makeLogger,
    toUserMessage,
    outputDelivery: session.outputDelivery,
    chunks: session.chunks,
    targetWiki: session.targetWiki,
    getIr: session.getIr,
    setIr: session.setIr,
    getExtraction: session.getExtraction,
  });

  const output = useWikitextOutput({
    configRef,
    makeLogger,
    toUserMessage,
    outputDelivery: session.outputDelivery,
    chunks: session.chunks,
    getIr: session.getIr,
    getExtraction: session.getExtraction,
  });

  const loadArticle = useCallback(
    async (source: ArticleSource) => {
      resetLog();
      output.resetWikitext();
      chunkActions.resetChunkState();
      await session.loadArticle(source);
    },
    [chunkActions, output, resetLog, session],
  );

  const openSession = useCallback(async () => {
    resetLog();
    output.resetWikitext();
    chunkActions.resetChunkState();

    const translatedByNodeId = await session.openSession();
    if (translatedByNodeId) {
      chunkActions.initializeChunkState(translatedByNodeId);
    }
  }, [chunkActions, output, resetLog, session]);

  return {
    status: session.status,
    currentStage,
    log,
    loadError: session.loadError,
    stages: PIPELINE_STAGE_ORDER,

    chunks: session.chunks,
    chunkState: chunkActions.chunkState,
    progress: chunkActions.progress,
    targetWiki: session.targetWiki,

    translateAllBusy: chunkActions.translateAllBusy,

    wikitext: output.wikitext,
    generateBusy: output.generateBusy,

    loadArticle,
    openSession,
    saveSession: output.saveSession,
    copyGeneralPrompt: chunkActions.copyGeneralPrompt,
    copyChunk: chunkActions.copyChunk,
    pasteChunkTranslation: chunkActions.pasteChunkTranslation,
    translateChunkBuiltIn: chunkActions.translateChunkBuiltIn,
    translateAllBuiltIn: chunkActions.translateAllBuiltIn,
    generateWikitext: output.generateWikitext,
    copyToClipboard: output.copyToClipboard,
    saveToFile: output.saveToFile,
  };
}
