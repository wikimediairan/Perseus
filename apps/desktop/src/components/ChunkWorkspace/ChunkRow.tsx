import type { Chunk } from "@perseus/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function ChunkRow({
  chunk,
  index,
  isDone,
  missingCount,
  busy,
  disabled,
  onCopy,
  onTranslateBuiltIn,
  onPasteTranslation,
  translatedText,
}: {
  chunk: Chunk;
  index: number;
  isDone: boolean;
  missingCount: number;
  busy: boolean;
  disabled: boolean;
  onCopy(): void;
  onTranslateBuiltIn(): void;
  onPasteTranslation(text: string): void;
  translatedText: string;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(!isDone);
  const [chunkCopied, setChunkCopied] = useState(false);
  const [draft, setDraft] = useState(translatedText);

  useEffect(() => {
    setDraft(translatedText);
  }, [translatedText]);

  function applyDraft() {
    if (draft.trim().length > 0) {
      onPasteTranslation(draft);
    }
  }

  async function handleCopyChunk() {
    onCopy();
    setChunkCopied(true);
    setTimeout(() => {
      setChunkCopied(false);
    }, 1500);
  }

  if (isDone && !expanded) {
    return (
      <button
        className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-secondary/40 p-2.5 text-left text-xs transition-colors hover:bg-secondary"
        onClick={() => {
          setExpanded(true);
        }}
        type="button"
      >
        <span className="flex items-center gap-2 text-muted-foreground">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
            ✓
          </span>
          {t("chunkWorkspace.chunkLabel", { index: index + 1 })}
        </span>
        <span className="text-muted-foreground">
          {t("chunkWorkspace.editAgain")}
        </span>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "flex items-center gap-1.5 text-xs font-medium",
            isDone ? "text-primary" : "text-muted-foreground",
          )}
        >
          {isDone && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
              ✓
            </span>
          )}
          {t("chunkWorkspace.chunkLabel", { index: index + 1 })}
        </span>
        {isDone && (
          <button
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              setExpanded(false);
            }}
            type="button"
          >
            {t("chunkWorkspace.collapse")}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-border bg-secondary/30 p-2.5 text-sm leading-relaxed">
        {chunk.units.map((unit) => (
          <p className="text-foreground" dir="ltr" key={unit.nodeId}>
            {unit.sourceText}
          </p>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={disabled}
          onClick={handleCopyChunk}
          size="sm"
          type="button"
          variant="outline"
        >
          {chunkCopied ? t("common.copied") : t("chunkWorkspace.copyChunk")}
        </Button>
        <Button
          disabled={disabled || busy}
          onClick={onTranslateBuiltIn}
          size="sm"
          type="button"
          variant="outline"
        >
          {busy
            ? t("chunkWorkspace.translating")
            : t("chunkWorkspace.translateWithBuiltIn")}
        </Button>
      </div>

      <Textarea
        disabled={disabled}
        onBlur={applyDraft}
        onChange={(e) => {
          setDraft(e.target.value);
        }}
        placeholder={t("chunkWorkspace.pastePlaceholder")}
        rows={3}
        value={draft}
      />

      {missingCount > 0 && (
        <p className="text-xs text-amber-600">
          {t("chunkWorkspace.missingSegments", { count: missingCount })}
        </p>
      )}
    </div>
  );
}
