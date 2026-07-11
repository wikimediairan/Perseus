/**
 * OutputCard
 *
 * Displays the generated Wikitext (Software Specification, Output) and
 * exposes exactly the two supported actions — copy and save — via the
 * existing OutputDelivery service. Rendered in the TARGET WIKI's own
 * script direction (Persian: RTL; Tajik: LTR — Tajik is written in
 * Cyrillic) so editors can actually read what they're about to publish,
 * rather than seeing correct-but-visually-broken text. This is
 * independent of the UI's own display language (see src/i18n) — a
 * Persian-speaking editor using the English UI to produce a Tajik
 * article should still see the output rendered LTR.
 */
import { TARGET_WIKIS } from "@core/config/targetWikis";
import type { TargetWikiCode } from "@core/config/targetWikis";
import { open } from "@tauri-apps/plugin-shell";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardHeader, CardContent, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

export function OutputCard({
  wikitext,
  targetWiki,
  onCopy,
  onSave,
}: {
  wikitext: string;
  targetWiki: TargetWikiCode;
  onCopy(): Promise<void>;
  onSave(suggestedName: string): Promise<null | string>;
}) {
  const { t } = useTranslation();
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [saveState, setSaveState] = useState<"idle" | "saved" | "cancelled">("idle");

  const direction = TARGET_WIKIS[targetWiki].direction;

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
            <a
              href="#"
              className="text-accent-foreground transition-all hover:opacity-80"
              onClick={async (e) => {
                e.preventDefault();
                await open(
                  `https://${TARGET_WIKIS[targetWiki].domain}/wiki/${TARGET_WIKIS[targetWiki].draft}`,
                );
              }}
            >
              {t("outputCard.draftLinkText")}
            </a>

            <a
              href="#"
              className="text-accent-foreground transition-all hover:opacity-80"
              onClick={async (e) => {
                e.preventDefault();
                await open(
                  `https://${TARGET_WIKIS[targetWiki].domain}/wiki/${TARGET_WIKIS[targetWiki].move}`,
                );
              }}
            >
              {t("outputCard.moveLinkText")}
            </a>
          </div>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCopy}>
            {copyState === "copied" ? t("common.copied") : t("outputCard.copyButton")}
          </Button>
          <Button variant="outline" size="sm" onClick={handleSave}>
            {saveState === "saved"
              ? t("common.saved")
              : saveState === "cancelled"
                ? t("common.notSaved")
                : t("outputCard.saveButton")}
          </Button>
        </div>
        <Textarea
          readOnly
          dir={direction}
          value={wikitext}
          className={
            direction === "rtl"
              ? "font-persian min-h-72 text-[15px] leading-relaxed"
              : "min-h-72 text-[15px] leading-relaxed"
          }
        />
      </CardContent>
    </Card>
  );
}
