import type { PipelineStageName } from "@core/pipeline/Pipeline";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import type { RunStatus } from "@/hooks/useChunkWorkspace";

/**
 * StageRail
 *
 * The run's signature visual: the eight real pipeline stages
 * (PIPELINE_STAGE_ORDER, from the core engine — not a hand-maintained
 * duplicate list) laid out as a horizontal rail. Nothing here decides
 * what the stages are or what order they run in; it only reflects
 * `currentStage` back visually, so watching a translation run means
 * watching the actual architecture execute, not a generic spinner.
 */

import { cn } from "@/lib/utils";

const getStageLabels = (t: TFunction): Record<PipelineStageName, string> => ({
  "load-article": t("stageRail.load"),
  "parse-with-parsoid": t("stageRail.parse"),
  "resolve-wikidata-links": t("stageRail.resolveLinks"),
  "extract-translatable-nodes": t("stageRail.extract"),
  chunking: t("stageRail.chunk"),
  "llm-translation": t("stageRail.translate"),
  merge: t("stageRail.merge"),
  "generate-wikitext": t("stageRail.generate"),
});

export function StageRail({
  stages,
  currentStage,
  status,
}: {
  stages: readonly PipelineStageName[];
  currentStage: null | PipelineStageName;
  status: RunStatus;
}) {
  const { t } = useTranslation();
  const stageLabels = getStageLabels(t);
  const currentIndex = currentStage ? stages.indexOf(currentStage) : -1;

  return (
    <ol className="flex items-center">
      {stages.map((stage, i) => {
        const isDone = i < currentIndex || (status === "ready" && i <= currentIndex);
        const isActive = i === currentIndex && status === "extracting";
        const isErrored = i === currentIndex && status === "error";

        return (
          <li key={stage} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] font-semibold transition-colors",
                  isDone && "border-primary bg-primary text-primary-foreground",
                  isActive && "animate-pulse border-primary bg-background text-primary",
                  isErrored && "border-destructive bg-destructive text-destructive-foreground",
                  !isDone &&
                    !isActive &&
                    !isErrored &&
                    "border-border bg-background text-muted-foreground",
                )}
                aria-current={isActive ? "step" : undefined}
              >
                {isDone ? "✓" : i + 1}
              </div>
              <span
                className={cn(
                  "text-[11px] whitespace-nowrap",
                  isActive ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {stageLabels[stage]}
              </span>
            </div>
            {i < stages.length - 1 && (
              <div
                className={cn("mx-1 h-px flex-1 -translate-y-3 bg-border", isDone && "bg-primary")}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
