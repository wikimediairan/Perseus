import type { LLMProviderConfig } from "@perseus/core";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ApiKeyField({
  provider,
  onChange,
}: {
  provider: LLMProviderConfig;
  onChange(next: LLMProviderConfig): void;
}) {
  const { t } = useTranslation();

  return (
    <div className="col-span-2 flex flex-col gap-1.5">
      <Label htmlFor="api-key">{t("providerCard.apiKeyLabel")}</Label>

      <Input
        dir="ltr"
        id="api-key"
        onChange={(e) => {
          if ("apiKey" in provider) {
            onChange({ ...provider, apiKey: e.target.value });
          }
        }}
        placeholder="sk-…"
        type="password"
        value={"apiKey" in provider ? (provider.apiKey ?? "") : ""}
      />
    </div>
  );
}
