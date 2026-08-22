import type { LLMProviderConfig } from "@perseus/core";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function BaseUrlField({
  provider,
  onChange,
}: {
  provider: LLMProviderConfig;
  onChange(next: LLMProviderConfig): void;
}) {
  const { t } = useTranslation();

  return (
    <div className="col-span-2 flex flex-col gap-1.5">
      <Label htmlFor="base-url">{t("providerCard.baseUrlLabel")}</Label>

      <Input
        dir="ltr"
        id="base-url"
        onChange={(e) => {
          if ("baseUrl" in provider) {
            onChange({ ...provider, baseUrl: e.target.value });
          }
        }}
        placeholder="http://localhost:11434"
        value={"baseUrl" in provider ? (provider.baseUrl ?? "") : ""}
      />
    </div>
  );
}
