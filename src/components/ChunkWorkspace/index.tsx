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
import { Card, CardTitle, CardHeader, CardContent, CardDescription } from "@/components/ui/card";
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
          <Button type="button" variant="outline" size="sm" onClick={handleCopyPrompt}>
            {promptCopied ? t("common.copied") : t("chunkWorkspace.copyGeneralPrompt")}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={disabled || translateAllBusy || allDone}
            onClick={onTranslateAllBuiltIn}
          >
            {translateAllBusy
              ? t("chunkWorkspace.translatingAll")
              : t("chunkWorkspace.translateAllBuiltIn")}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleSave}>
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
              key={chunk.id}
              index={i}
              chunk={chunk}
              isDone={isChunkDone(chunk, chunkState.translatedByNodeId)}
              missingCount={chunkState.missingByChunkId.get(chunk.id) ?? 0}
              busy={chunkState.busyChunkIds.has(chunk.id)}
              disabled={disabled}
              onCopy={() => {
                onCopyChunk(chunk);
              }}
              onTranslateBuiltIn={() => {
                onTranslateChunkBuiltIn(chunk);
              }}
              onPasteTranslation={(text) => {
                onPasteChunkTranslation(chunk, text);
              }}
            />
          ))}
        </div>

        <Button
          type="button"
          disabled={progress.translated === 0 || generateBusy}
          onClick={onGenerateWikitext}
        >
          {generateBusy ? t("chunkWorkspace.generating") : t("chunkWorkspace.generateWikitext")}
        </Button>
      </CardContent>
    </Card>
  );
}
