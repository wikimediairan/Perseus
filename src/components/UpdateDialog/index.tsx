
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
/**
 * UpdateDialog
 *
 * Presentation only. Shown when useUpdateChecker finds a newer GitHub
 * release than the version currently running. Never checks for updates
 * itself and never talks to the network — that responsibility belongs
 * entirely to services/updateChecker.ts.
 */
import {
  Dialog,
  DialogTitle,
  DialogFooter,
  DialogHeader,
  DialogContent,
  DialogDescription,
} from "@/components/ui/dialog";
import type { UpdateCheckResult } from "@/services/updateChecker";

export function UpdateDialog({
  result,
  onOpenReleases,
  onDismiss,
}: {
  result: UpdateCheckResult;
  onOpenReleases(): void;
  onDismiss(): void;
}) {
  const { t } = useTranslation();

  return (
    <Dialog open onOpenChange={(open) => !open && onDismiss()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("updateDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("updateDialog.currentVersion")} {result.currentVersion} &nbsp;·&nbsp;{" "}
            {t("updateDialog.latestVersion")} {result.latestVersion}
          </DialogDescription>
        </DialogHeader>

        {result.releaseNotes && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">{t("updateDialog.releaseNotesLabel")}</p>
            <p className="max-h-40 overflow-y-auto rounded-md bg-secondary p-3 text-sm whitespace-pre-wrap text-foreground">
              {result.releaseNotes}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            {t("updateDialog.remindLater")}
          </Button>
          <Button size="sm" onClick={onOpenReleases}>
            {t("updateDialog.openReleases")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
