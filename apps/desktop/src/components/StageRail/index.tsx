import type { PipelineStageName } from "@perseus/core";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type { RunStatus } from "@/hooks/useChunkWorkspace";
import { cn } from "@/lib/utils";

const getStageLabels = (t: TFunction): Record<PipelineStageName, string> => ({
  "load-article": t("stageRail.load"),
  "parse-with-parsoid": t("stageRail.parse"),
  "resolve-wikidata-links": t("stageRail.resolveLinks"),
  "extract-translatable-nodes": t("stageRail.extract"),
  chunking: t("stageRail.chunk"),
  translation: t("stageRail.translate"),
  merge: t("stageRail.merge"),
  "generate-wikitext": t("stageRail.generate"),
});

export function StageRail({
  stages,
  allStages,
  currentStage,
  status,
}: {
  stages: readonly PipelineStageName[];
  allStages: readonly PipelineStageName[];
  currentStage: null | PipelineStageName;
  status: RunStatus;
}) {
  const { t } = useTranslation();

  const stageLabels = getStageLabels(t);

  // index واقعی در کل pipeline
  const currentIndex = currentStage ? allStages.indexOf(currentStage) : -1;

  return (
    <ol className="flex items-center">
      {stages.map((stage, i) => {
        // index واقعی این stage در pipeline کامل
        const stageIndex = allStages.indexOf(stage);

        const isDone =
          stageIndex < currentIndex ||
          (status === "ready" && stageIndex <= currentIndex);

        const isActive = stage === currentStage && status === "extracting";

        const isErrored = stage === currentStage && status === "error";

        return (
          <li className="flex flex-1 items-center last:flex-none" key={stage}>
            <div className="flex flex-col items-center gap-1">
              <div
                aria-current={isActive ? "step" : undefined}
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] font-semibold transition-colors",

                  isDone && "border-primary bg-primary text-primary-foreground",

                  isActive &&
                    "animate-pulse border-primary bg-background text-primary",

                  isErrored &&
                    "border-destructive bg-destructive text-destructive-foreground",

                  !isDone &&
                    !isActive &&
                    !isErrored &&
                    "border-border bg-background text-muted-foreground",
                )}
              >
                {isDone ? "✓" : i + 1}
              </div>

              <span
                className={cn(
                  "text-[11px] whitespace-nowrap",
                  isActive
                    ? "font-medium text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {stageLabels[stage]}
              </span>
            </div>

            {i < stages.length - 1 && (
              <div
                className={cn(
                  "mx-1 h-px flex-1 -translate-y-3 bg-border",
                  isDone && "bg-primary",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
