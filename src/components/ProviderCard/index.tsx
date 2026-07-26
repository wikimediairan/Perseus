import type { LLMProviderConfig, PerseusConfig } from "@core/config/Config";
import type { TFunction } from "i18next";

import { useTranslation } from "react-i18next";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const getProviderLabels = (t: TFunction): Record<LLMProviderConfig["kind"], string> => ({
  ollama: t("providerCard.providers.ollama"),
  openai: t("providerCard.providers.openai"),
  openrouter: t("providerCard.providers.openrouter"),
  anthropic: t("providerCard.providers.anthropic"),
  gemini: t("providerCard.providers.gemini"),
});

/** Providers with a user-configurable endpoint. Everyone else (a fixed vendor API) has no Base URL field at all. */
const PROVIDERS_WITH_BASE_URL = new Set<LLMProviderConfig["kind"]>(["ollama"]);

/** Only a local Ollama instance has no notion of an API key. */
const PROVIDERS_WITHOUT_API_KEY = new Set<LLMProviderConfig["kind"]>(["ollama"]);

const MODEL_PLACEHOLDER: Record<LLMProviderConfig["kind"], string> = {
  ollama: "llama3",
  openai: "gpt-4o-mini",
  openrouter: "anthropic/claude-3.5-sonnet",
  anthropic: "claude-sonnet-4-5",
  gemini: "gemini-2.5-flash",
};

export function ProviderCard({
  config,
  disabled,
  onChange,
}: {
  config: PerseusConfig;
  disabled: boolean;
  onChange(config: PerseusConfig): void;
}) {
  const { t } = useTranslation();
  const providerLabels = getProviderLabels(t);
  const provider = config.activeProvider;

  function updateProvider(patch: Partial<LLMProviderConfig>) {
    onChange({ ...config, activeProvider: { ...provider, ...patch } });
  }

  function updateUserPrompt(userPrompt: string) {
    onChange({
      ...config,
      prompt: { ...config.prompt, userPrompt: userPrompt || undefined },
    });
  }

  return (
    <Card>
      <CardContent className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>{t("providerCard.providerLabel")}</Label>
          <Select
            disabled={disabled}
            onValueChange={(kind) => {
              updateProvider({ kind: kind as LLMProviderConfig["kind"] });
            }}
            value={provider.kind}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(providerLabels) as LLMProviderConfig["kind"][]).map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {providerLabels[kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="model">{t("providerCard.modelLabel")}</Label>
          <Input
            dir="ltr"
            disabled={disabled}
            id="model"
            onChange={(e) => {
              updateProvider({ model: e.target.value });
            }}
            placeholder={MODEL_PLACEHOLDER[provider.kind]}
            value={provider.model}
          />
        </div>

        {PROVIDERS_WITH_BASE_URL.has(provider.kind) && (
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="base-url">{t("providerCard.baseUrlLabel")}</Label>
            <Input
              dir="ltr"
              disabled={disabled}
              id="base-url"
              onChange={(e) => {
                updateProvider({ baseUrl: e.target.value });
              }}
              placeholder="http://localhost:11434"
              value={provider.baseUrl ?? ""}
            />
          </div>
        )}

        {!PROVIDERS_WITHOUT_API_KEY.has(provider.kind) && (
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="api-key">{t("providerCard.apiKeyLabel")}</Label>
            <Input
              dir="ltr"
              disabled={disabled}
              id="api-key"
              onChange={(e) => {
                updateProvider({ apiKey: e.target.value });
              }}
              placeholder="sk-…"
              type="password"
              value={provider.apiKey ?? ""}
            />
          </div>
        )}

        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="user-prompt">{t("providerCard.additionalPromptsLabel")}</Label>
          <Textarea
            disabled={disabled}
            id="user-prompt"
            onChange={(e) => {
              updateUserPrompt(e.target.value);
            }}
            placeholder={t("providerCard.additionalPromptsPlaceholder")}
            rows={2}
            value={config.prompt.userPrompt ?? ""}
          />
        </div>
      </CardContent>
    </Card>
  );
}
