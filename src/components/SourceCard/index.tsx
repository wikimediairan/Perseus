import type { PerseusConfig } from "@core/config/Config";
import type { TargetWikiCode } from "@core/config/targetWikis";
import { TARGET_WIKIS } from "@core/config/targetWikis";
import type { ArticleSource } from "@core/input/InputLoader";
import { open } from "@tauri-apps/plugin-dialog";
/**
 * SourceCard
 *
 * Lets the user pick exactly one input, per the Software Specification
 * (Section 4.1): an English Wikipedia URL, or a local .wiki file. File
 * selection uses the Tauri dialog plugin only to obtain a path — reading
 * the file itself still happens inside WikipediaInputLoader (core
 * engine), not here.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { TextContextMenu } from "../ContextMenu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

export function SourceCard({
  disabled,
  actionLabel,
  busyLabel,
  onSubmit,
  config,
  onChange,
}: {
  disabled: boolean;
  actionLabel: string;
  busyLabel: string;
  onSubmit(source: ArticleSource): void;
  config: PerseusConfig;
  onChange(config: PerseusConfig): void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"url" | "file">("url");
  const [url, setUrl] = useState("");
  const [filePath, setFilePath] = useState<null | string>(null);

  async function pickFile() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Wikitext", extensions: ["wiki", "txt"] }],
    });
    if (typeof selected === "string") {
      setFilePath(selected);
    }
  }

  const canSubmit = mode === "url" ? url.trim().length > 0 : filePath !== null;

  function handleSubmit() {
    if (mode === "url") {
      onSubmit({ kind: "url", url: url.trim() });
    } else if (filePath) {
      onSubmit({ kind: "file", path: filePath });
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="inline-flex w-fit rounded-md border border-border bg-secondary p-0.5">
          {(["url", "file"] as const).map((m) => (
            <button
              className={cn(
                "cursor-pointer rounded-[5px] px-3 py-1 text-xs font-medium transition-colors",
                mode === m ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
              disabled={disabled}
              key={m}
              onClick={() => {
                setMode(m);
              }}
              type="button"
            >
              {m === "url" ? t("sourceCard.tabUrl") : t("sourceCard.tabFile")}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">
        {mode === "url" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="article-url">{t("sourceCard.articleUrlLabel")}</Label>
            <TextContextMenu>
              <Input
                autoComplete="off"
                dir="ltr"
                disabled={disabled}
                id="article-url"
                onChange={(e) => {
                  setUrl(e.target.value);
                }}
                placeholder={t("sourceCard.articleUrlPlaceholder")}
                value={url}
              />
            </TextContextMenu>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label>{t("sourceCard.localFileLabel")}</Label>
            <div>
              <Input
                className="flex-1 cursor-pointer"
                disabled={disabled}
                onClick={pickFile}
                placeholder={t("sourceCard.noFileSelected")}
                readOnly
                value={filePath ?? ""}
              />
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label>{t("providerCard.targetWikiLabel")}</Label>
          <Select
            disabled={disabled}
            onValueChange={(code) => {
              onChange({ ...config, targetWiki: code as TargetWikiCode });
            }}
            value={config.targetWiki}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(TARGET_WIKIS) as TargetWikiCode[]).map((code) => (
                <SelectItem key={code} value={code}>
                  {t(`providerCard.targetWikis.${code}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button className="mt-1 w-fit" disabled={disabled || !canSubmit} onClick={handleSubmit}>
          {disabled ? busyLabel : actionLabel}
        </Button>
      </CardContent>
    </Card>
  );
}
