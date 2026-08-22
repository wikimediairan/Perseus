import type {
  Chunk,
  ExtractionResult,
  Logger,
  PerseusConfig,
} from "@perseus/core";
import {
  createPipeline,
  DEFAULT_MAX_CHUNK_CHARS,
  exportTranslationSession,
} from "@perseus/core";
import { useCallback, useState } from "react";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import type { OutputDelivery } from "@/services/OutputDelivery";

type IR = ExtractionResult["ir"];

interface Params {
  configRef: React.RefObject<PerseusConfig>;
  makeLogger(): Logger;
  toUserMessage(err: unknown): string;
  outputDelivery: OutputDelivery;
  chunks: Chunk[] | null;
  getIr(): IR | null;
  getExtraction(): ExtractionResult | null;
}

/** Generates final Wikitext from the current IR, and delivers it (clipboard, file, or a saved session) via `OutputDelivery`. */
export function useWikitextOutput({
  configRef,
  makeLogger,
  toUserMessage,
  outputDelivery,
  chunks,
  getIr,
  getExtraction,
}: Params) {
  const [wikitext, setWikitext] = useState<null | string>(null);

  const resetWikitext = useCallback(() => {
    setWikitext(null);
  }, []);

  const generateAction = useAsyncAction(async () => {
    const ir = getIr();
    if (!ir) {
      return;
    }

    const pipeline = createPipeline(configRef.current, makeLogger());
    await pipeline.classifyReferenceAttention(ir);
    const text = await pipeline.generateWikitext(ir);
    setWikitext(text);
  }, toUserMessage);

  const saveSession = useCallback(
    async (suggestedName: string) => {
      const extraction = getExtraction();
      const ir = getIr();
      if (!extraction || !chunks || !ir) {
        return null;
      }

      const session = exportTranslationSession(
        { ...extraction, ir },
        chunks,
        DEFAULT_MAX_CHUNK_CHARS,
      );

      return outputDelivery.saveSession(session, suggestedName);
    },
    [chunks, getExtraction, getIr, outputDelivery],
  );

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
    wikitext,
    generateBusy: generateAction.busy,
    generateWikitext: generateAction.run,
    saveSession,
    copyToClipboard,
    saveToFile,
    resetWikitext,
  };
}
