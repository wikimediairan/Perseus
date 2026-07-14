/**
 * ChunkWorkspace
 *
 * The single workspace where a loaded article's chunks live — the
 * centerpiece of the Unified Chunk Architecture. Replaces the old
 * Translation Package's "export JSON / import JSON" card: chunking is
 * now visible, and translation happens IN Perseus, chunk by chunk, via
 * either the built-in LLM or copy/paste with any external AI — never
 * both a hidden internal representation and a separate export format.
 *
 * Only ever calls into useChunkWorkspace (core engine underneath) — no
 * chunk rendering/parsing/merge logic lives here, only presentation.
 */
import type { Chunk } from "@core/chunker/Chunker";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ChunkRow } from "@/components/ChunkWorkspace/ChunkRow";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { ChunkState } from "@/hooks/useChunkWorkspace";

function isChunkDone(chunk: Chunk, translatedByNodeId: Map<string, string>): boolean {
  return chunk.units.every((u) => translatedByNodeId.has(u.nodeId));
}

export function ChunkWorkspace({
  chunks,
  chunkState,
  progress,
  disabled,
  translateAllBusy,
  onCopyGeneralPrompt,
  onCopyChunk,
  onTranslateChunkBuiltIn,
  onPasteChunkTranslation,
  onTranslateAllBuiltIn,
  onSaveSession,
  onGenerateWikitext,
  generateBusy,
}: {
  chunks: Chunk[];
  chunkState: ChunkState;
  progress: { translated: number; total: number; percent: number };
  disabled: boolean;
  translateAllBusy: boolean;
  onCopyGeneralPrompt(): void;
  onCopyChunk(chunk: Chunk): void;
  onTranslateChunkBuiltIn(chunk: Chunk): void;
  onPasteChunkTranslation(chunk: Chunk, text: string): void;
  onTranslateAllBuiltIn(): void;
  onSaveSession(): void;
  onGenerateWikitext(): void;
  generateBusy: boolean;
}) {
  const { t } = useTranslation();
  const [saveState, setSaveState] = useState<"idle" | "saved" | "cancelled">("idle");
  const [promptCopied, setPromptCopied] = useState(false);

  async function handleSave() {
    setSaveState("idle");
    onSaveSession();
  }

  async function handleCopyPrompt() {
    onCopyGeneralPrompt();
    setPromptCopied(true);
    setTimeout(() => {
      setPromptCopied(false);
    }, 1500);
  }

  const allDone = progress.total > 0 && progress.translated === progress.total;

  return (
    <Card className="">
      <CardHeader>
        <CardTitle>{t("chunkWorkspace.title")}</CardTitle>
        <CardDescription>{t("chunkWorkspace.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleCopyPrompt} size="sm" type="button" variant="outline">
            {promptCopied ? t("common.copied") : t("chunkWorkspace.copyGeneralPrompt")}
          </Button>
          <Button
            disabled={disabled || translateAllBusy || allDone}
            onClick={onTranslateAllBuiltIn}
            size="sm"
            type="button"
          >
            {translateAllBusy
              ? t("chunkWorkspace.translatingAll")
              : t("chunkWorkspace.translateAllBuiltIn")}
          </Button>
          <Button onClick={handleSave} size="sm" type="button" variant="outline">
            {saveState === "saved"
              ? t("common.saved")
              : saveState === "cancelled"
                ? t("common.notSaved")
                : t("chunkWorkspace.saveSession")}
          </Button>
        </div>

        <div className="flex flex-col gap-1.5">
          <Progress value={progress.percent} />
          <p className="text-xs text-muted-foreground">
            {t("chunkWorkspace.progress", {
              translated: progress.translated,
              total: progress.total,
              percent: progress.percent,
            })}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {chunks.map((chunk, i) => (
            <ChunkRow
              busy={chunkState.busyChunkIds.has(chunk.id)}
              chunk={chunk}
              disabled={disabled}
              index={i}
              isDone={isChunkDone(chunk, chunkState.translatedByNodeId)}
              key={chunk.id}
              missingCount={chunkState.missingByChunkId.get(chunk.id) ?? 0}
              onCopy={() => {
                onCopyChunk(chunk);
              }}
              onPasteTranslation={(text) => {
                onPasteChunkTranslation(chunk, text);
              }}
              onTranslateBuiltIn={() => {
                onTranslateChunkBuiltIn(chunk);
              }}
            />
          ))}
        </div>

        <Button
          disabled={progress.translated === 0 || generateBusy}
          onClick={onGenerateWikitext}
          type="button"
        >
          {generateBusy ? t("chunkWorkspace.generating") : t("chunkWorkspace.generateWikitext")}
        </Button>
      </CardContent>
    </Card>
  );
}
