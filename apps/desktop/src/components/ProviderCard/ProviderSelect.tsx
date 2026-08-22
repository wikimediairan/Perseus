import type { LLMProviderConfig } from "@perseus/core";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { getProviderLabels } from "./providerCapabilities";

export function ProviderSelect({
  kind,
  onChange,
}: {
  kind: LLMProviderConfig["kind"];
  onChange(kind: LLMProviderConfig["kind"]): void;
}) {
  const { t } = useTranslation();
  const providerLabels = getProviderLabels(t);

  return (
    <div className="flex flex-col gap-1.5">
      <Label>{t("providerCard.providerLabel")}</Label>

      <Select
        onValueChange={(value) => {
          onChange(value as LLMProviderConfig["kind"]);
        }}
        value={kind}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>

        <SelectContent>
          {(Object.keys(providerLabels) as LLMProviderConfig["kind"][]).map(
            (k) => (
              <SelectItem key={k} value={k}>
                {providerLabels[k]}
              </SelectItem>
            ),
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
