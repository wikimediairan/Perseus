import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useWikimediaQuota } from "@/hooks/useWikimediaQuota";

function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

export function WikimediaQuotaIndicator({
  apiKey,
}: {
  apiKey: string | undefined;
}) {
  const { t, i18n } = useTranslation();
  const { quota, loading, hasError, refetch } = useWikimediaQuota(apiKey);

  if (!apiKey) {
    return null;
  }

  return (
    <div className="col-span-2 flex flex-col gap-2 rounded-md border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">
          {t("providerCard.quota.title")}
        </span>
        <Button
          className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
          disabled={loading}
          onClick={() => {
            void refetch();
          }}
          type="button"
          variant="ghost"
        >
          {loading
            ? t("providerCard.quota.refreshing")
            : t("providerCard.quota.refresh")}
        </Button>
      </div>

      {hasError && (
        <p className="text-xs text-destructive">
          {t("providerCard.quota.error")}
        </p>
      )}

      {!hasError && quota && (
        <>
          <Progress value={(quota.usedCost / quota.weeklyLimitCost) * 100} />

          <div
            className="flex items-center justify-between text-xs text-muted-foreground"
            dir="ltr"
          >
            <span>
              {t("providerCard.quota.used", {
                used: formatCost(quota.usedCost),
                limit: formatCost(quota.weeklyLimitCost),
              })}
            </span>
            <span>
              {t("providerCard.quota.remaining", {
                remaining: formatCost(quota.remainingCost),
              })}
            </span>
          </div>

          <p className="text-xs text-muted-foreground">
            {t("providerCard.quota.resetsAt", {
              date: new Date(quota.resetsAt).toLocaleString(i18n.language),
            })}
          </p>
        </>
      )}

      {!hasError && !quota && loading && (
        <p className="text-xs text-muted-foreground">
          {t("providerCard.quota.loading")}
        </p>
      )}
    </div>
  );
}
