import type { LLMProviderConfig, WikimediaProviderConfig } from "@core/config/Config";
import { WIKIMEDIA_MODELS } from "@core/config/Config";
import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { MODEL_PLACEHOLDER, WIKIMEDIA_MODEL_LABELS } from "./providerCapabilities";

/**
 * Wikimedia's model isn't a free-text field like the other providers' —
 * it's constrained to exactly WIKIMEDIA_MODELS, so it gets its own
 * dropdown instead of being forced into the generic <Input> below.
 */
function WikimediaModelSelect({
  provider,
  onChange,
}: {
  provider: WikimediaProviderConfig;
  onChange(next: WikimediaProviderConfig): void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="model">{t("providerCard.modelLabel")}</Label>

      <Select
        onValueChange={(model) => {
          onChange({
            ...provider,
            model: model as WikimediaProviderConfig["model"],
          });
        }}
        value={provider.model}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>

        <SelectContent>
          {WIKIMEDIA_MODELS.map((model) => (
            <SelectItem key={model} value={model}>
              {WIKIMEDIA_MODEL_LABELS[model]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

type TextProviderConfig = Exclude<LLMProviderConfig, WikimediaProviderConfig>;

function FreeTextModelInput({
  provider,
  onChange,
}: {
  provider: TextProviderConfig;
  onChange(next: TextProviderConfig): void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="model">{t("providerCard.modelLabel")}</Label>

      <Input
        dir="ltr"
        id="model"
        onChange={(e) => {
          onChange({ ...provider, model: e.target.value });
        }}
        placeholder={MODEL_PLACEHOLDER[provider.kind]}
        value={provider.model}
      />
    </div>
  );
}

export function ModelField({
  provider,
  onChange,
}: {
  provider: LLMProviderConfig;
  onChange(next: LLMProviderConfig): void;
}) {
  if (provider.kind === "wikimedia") {
    return <WikimediaModelSelect onChange={onChange} provider={provider} />;
  }

  return <FreeTextModelInput onChange={onChange} provider={provider} />;
}
