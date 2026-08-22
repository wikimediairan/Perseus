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

import type { ArticleSource, PerseusConfig } from "@perseus/core";
import { PerseusError, PIPELINE_STAGE_ORDER } from "@perseus/core";
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";

import { notifySessionExpired } from "@/services/SessionAuth";
import { toUserMessage as toUserMessageImpl } from "./errorMessages";
import { useChunkTranslationActions } from "./useChunkTranslationActions";
import { useTranslationSession } from "./useTranslationSession";
import { useUiLogger } from "./useUiLogger";
import { useWikitextOutput } from "./useWikitextOutput";

export type { ChunkState, LogLine, RunStatus } from "./types";

/** A `ProviderError` with HTTP 401 from the Wikimedia provider means the
 * Backend session token is no longer valid (expired/revoked) -- not a
 * translation failure to show the user as-is. See
 * services/SessionAuth.ts for why this is a DOM event rather than a
 * callback threaded through useTranslationSession /
 * useChunkTranslationActions / useWikitextOutput, none of which have
 * any other reason to know the session/auth model exists. */
function isWikimediaSessionExpired(err: unknown): boolean {
  return (
    err instanceof PerseusError &&
    err.category === "ProviderError" &&
    err.context?.status === 401
  );
}

export function useChunkWorkspace(config: PerseusConfig) {
  const { t } = useTranslation();

  const configRef = useRef(config);
  configRef.current = config;

  const toUserMessage = useCallback(
    (err: unknown) => {
      if (isWikimediaSessionExpired(err)) {
        void notifySessionExpired();
        return t("providerCard.auth.sessionExpired");
      }
      return toUserMessageImpl(err, t);
    },
    [t],
  );

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
