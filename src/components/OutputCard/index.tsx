import type { TargetWikiCode } from "@core/config/targetWikis";
import { TARGET_WIKIS } from "@core/config/targetWikis";
import { open } from "@tauri-apps/plugin-shell";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function OutputCard({
  targetWiki,
  onCopy,
  onSave,
}: {
  targetWiki: TargetWikiCode;
  onCopy(): Promise<void>;
  onSave(suggestedName: string): Promise<null | string>;
}) {
  const { t } = useTranslation();
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [saveState, setSaveState] = useState<"idle" | "saved" | "cancelled">("idle");

  async function handleCopy() {
    await onCopy();
    setCopyState("copied");
    setTimeout(() => {
      setCopyState("idle");
    }, 1500);
  }

  async function handleSave() {
    const path = await onSave("translated-article.wiki");
    setSaveState(path ? "saved" : "cancelled");
    setTimeout(() => {
      setSaveState("idle");
    }, 1500);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t("outputCard.title", { wiki: t(`providerCard.targetWikis.${targetWiki}`) })}
        </CardTitle>
        <CardDescription className="flex flex-col gap-y-3">
          {t("outputCard.description")}

          <div className="flex flex-col">
            <button
              className="text-accent-foreground transition-all hover:opacity-80"
              onClick={async (e) => {
                e.preventDefault();
                await open(
                  `https://${TARGET_WIKIS[targetWiki].domain}/wiki/${TARGET_WIKIS[targetWiki].draft}`,
                );
              }}
              type="button"
            >
              {t("outputCard.draftLinkText")}
            </button>

            <button
              className="text-accent-foreground transition-all hover:opacity-80"
              onClick={async (e) => {
                e.preventDefault();
                await open(
                  `https://${TARGET_WIKIS[targetWiki].domain}/wiki/${TARGET_WIKIS[targetWiki].move}`,
                );
              }}
              type="button"
            >
              {t("outputCard.moveLinkText")}
            </button>
          </div>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex gap-2">
        <Button onClick={handleCopy} size="sm" variant="outline">
          {copyState === "copied" ? t("common.copied") : t("outputCard.copyButton")}
        </Button>
        <Button onClick={handleSave} size="sm" variant="outline">
          {saveState === "saved"
            ? t("common.saved")
            : saveState === "cancelled"
              ? t("common.notSaved")
              : t("outputCard.saveButton")}
        </Button>
      </CardContent>
    </Card>
  );
}
