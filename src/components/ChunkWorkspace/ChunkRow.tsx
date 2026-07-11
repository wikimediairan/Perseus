/**
 * ChunkRow
 *
 * One row of the chunk workspace — the UI-facing half of the Unified
 * Chunk Architecture. Whether a chunk gets translated by the built-in
 * LLM (the "Translate" button here) or by a human pasting into an
 * external AI (Copy this row, paste the reply back into the textarea),
 * both paths converge on the exact same `pasteChunkTranslation`/
 * `translateChunkBuiltIn` calls in useChunkWorkspace, which in turn both
 * go through the same render/parse pair in core/chunker/segmentProtocol.
 *
 * "Translated" is a purely computed, display-only status (every unit's
 * nodeId present in `translatedByNodeId`) — never a persisted field, per
 * the Design Proposal's scope note on chunk status tracking. A done
 * chunk collapses to a one-line summary; clicking it re-expands so a
 * translation can still be corrected.
 */
import type { Chunk } from "@core/chunker/Chunker";
import { useState } from "react";
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
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(!isDone);
  const [draft, setDraft] = useState("");

  function applyDraft() {
    if (draft.trim().length > 0) {
      onPasteTranslation(draft);
    }
  }

  if (isDone && !expanded) {
    return (
      <button
        type="button"
        onClick={() => { setExpanded(true); }}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-secondary/40 p-2.5 text-left text-xs transition-colors hover:bg-secondary"
      >
        <span className="flex items-center gap-2 text-muted-foreground">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">✓</span>
          {t("chunkWorkspace.chunkLabel", { index: index + 1 })}
        </span>
        <span className="text-muted-foreground">{t("chunkWorkspace.editAgain")}</span>
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
          {isDone && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">✓</span>}
          {t("chunkWorkspace.chunkLabel", { index: index + 1 })}
        </span>
        {isDone && (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => { setExpanded(false); }}
          >
            {t("chunkWorkspace.collapse")}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-border bg-secondary/30 p-2.5 text-sm leading-relaxed">
        {chunk.units.map((unit) => (
          <p key={unit.nodeId} dir="ltr" className="text-foreground">
            {unit.sourceText}
          </p>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onCopy}>
          {t("chunkWorkspace.copyChunk")}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={disabled || busy} onClick={onTranslateBuiltIn}>
          {busy ? t("chunkWorkspace.translating") : t("chunkWorkspace.translateWithBuiltIn")}
        </Button>
      </div>

      <Textarea
        rows={3}
        disabled={disabled}
        placeholder={t("chunkWorkspace.pastePlaceholder")}
        value={draft}
        onChange={(e) => { setDraft(e.target.value); }}
        onBlur={applyDraft}
      />

      {missingCount > 0 && (
        <p className="text-xs text-amber-600">
          {t("chunkWorkspace.missingSegments", { count: missingCount })}
        </p>
      )}
    </div>
  );
}
