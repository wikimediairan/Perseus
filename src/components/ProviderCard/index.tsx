import type { PerseusConfig, LLMProviderConfig } from "@core/config/Config";
import type { TFunction } from "i18next";

/**
 * ProviderCard
 *
 * Exposes exactly the configuration the Software Specification calls
 * for (Section 14): provider selection, model, the optional user
 * prompt appended after the built-in default (Section 4.9), and the
 * Target Wiki (Persian Wikipedia, Tajik Wikipedia, ...) — nothing else.
 * No settings system, just this one card.
 *
 * Target Wiki lives here (not nested under a "Built-in LLM only" mode)
 * because Link Resolution — shared by every executor, built-in or
 * manual — depends on it at extraction time, before the user has even
 * chosen how a chunk will get translated. It's disabled once an article
 * has been loaded (`disabled` covers this — see App.tsx) so a session's
 * Wikidata-resolved links and its declared target wiki can never drift
 * apart mid-session.
 */
import { useTranslation } from "react-i18next";

import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectItem,
  SelectValue,
  SelectContent,
  SelectTrigger,
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
      <CardHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>{t("providerCard.providerLabel")}</Label>
            <Select
              value={provider.kind}
              disabled={disabled}
              onValueChange={(kind) => {
                updateProvider({ kind: kind as LLMProviderConfig["kind"] });
              }}
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
              id="model"
              dir="ltr"
              placeholder={MODEL_PLACEHOLDER[provider.kind]}
              value={provider.model}
              disabled={disabled}
              onChange={(e) => {
                updateProvider({ model: e.target.value });
              }}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {PROVIDERS_WITH_BASE_URL.has(provider.kind) && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="base-url">{t("providerCard.baseUrlLabel")}</Label>
            <Input
              id="base-url"
              dir="ltr"
              placeholder="http://localhost:11434"
              value={provider.baseUrl ?? ""}
              disabled={disabled}
              onChange={(e) => {
                updateProvider({ baseUrl: e.target.value });
              }}
            />
          </div>
        )}

        {!PROVIDERS_WITHOUT_API_KEY.has(provider.kind) && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="api-key">{t("providerCard.apiKeyLabel")}</Label>
            <Input
              id="api-key"
              dir="ltr"
              type="password"
              placeholder="sk-…"
              value={provider.apiKey ?? ""}
              disabled={disabled}
              onChange={(e) => {
                updateProvider({ apiKey: e.target.value });
              }}
            />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="user-prompt">{t("providerCard.additionalPromptsLabel")}</Label>
          <Textarea
            id="user-prompt"
            rows={2}
            placeholder={t("providerCard.additionalPromptsPlaceholder")}
            value={config.prompt.userPrompt ?? ""}
            disabled={disabled}
            onChange={(e) => {
              updateUserPrompt(e.target.value);
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
