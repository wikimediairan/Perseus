import type { PerseusConfig } from "@core/config/Config";
import type { TargetWikiCode } from "@core/config/targetWikis";
import { TARGET_WIKIS } from "@core/config/targetWikis";
import type { ArticleSource } from "@core/input/InputLoader";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TextContextMenu } from "../ContextMenu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

export function SourceCard({
  disabled,
  busy,
  actionLabel,
  busyLabel,
  onSubmit,
  config,
  onChange,
}: {
  disabled: boolean;
  busy: boolean;
  actionLabel: string;
  busyLabel: string;
  onSubmit(source: ArticleSource): void;
  config: PerseusConfig;
  onChange(config: PerseusConfig): void;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState("");

  const canSubmit = url.trim().length > 0;

  function handleSubmit() {
    onSubmit({ url: url.trim() });
  }

  return (
    <Card>
      <CardContent className="grid grid-cols-2 gap-3 pt-6">
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

        <div className="col-span-2">
          <Button className="mt-1 w-fit" disabled={disabled || !canSubmit} onClick={handleSubmit}>
            {busy ? busyLabel : actionLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
