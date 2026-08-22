import type { LLMProviderConfig, PerseusConfig } from "@perseus/core";
import { Card, CardContent } from "@/components/ui/card";

import { ApiKeyField } from "./ApiKeyField";
import { BaseUrlField } from "./BaseUrlField";
import { ModelField } from "./ModelField";
import { ProviderSelect } from "./ProviderSelect";
import {
  createProviderConfig,
  PROVIDERS_WITH_API_KEY,
  PROVIDERS_WITH_BASE_URL,
  PROVIDERS_WITH_USER_PROMPT,
} from "./providerCapabilities";
import { UserPromptField } from "./UserPromptField";
import { WikimediaAuthField } from "./WikimediaAuthField";

export function ProviderCard({
  config,
  onChange,
}: {
  config: PerseusConfig;
  onChange(config: PerseusConfig): void;
}) {
  const provider = config.activeProvider;

  function updateProvider(nextProvider: LLMProviderConfig) {
    onChange({ ...config, activeProvider: nextProvider });
  }

  return (
    <Card>
      <CardContent className="grid grid-cols-2 gap-3 pt-4">
        <ProviderSelect
          kind={provider.kind}
          onChange={(kind) => {
            updateProvider(createProviderConfig(kind));
          }}
        />

        <ModelField onChange={updateProvider} provider={provider} />

        {PROVIDERS_WITH_BASE_URL.has(provider.kind) && (
          <BaseUrlField onChange={updateProvider} provider={provider} />
        )}

        {PROVIDERS_WITH_API_KEY.has(provider.kind) && (
          <ApiKeyField onChange={updateProvider} provider={provider} />
        )}

        {provider.kind === "wikimedia" && (
          <WikimediaAuthField onChange={updateProvider} provider={provider} />
        )}

        {PROVIDERS_WITH_USER_PROMPT.has(provider.kind) && (
          <UserPromptField
            onChange={(userPrompt) => {
              onChange({
                ...config,
                prompt: {
                  ...config.prompt,
                  userPrompt: userPrompt || undefined,
                },
              });
            }}
            userPrompt={config.prompt.userPrompt}
          />
        )}
      </CardContent>
    </Card>
  );
}
