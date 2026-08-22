//? Loads PerseusConfig on mount and persists changes via the existing

import type { PerseusConfig } from "@perseus/core";
import { DEFAULT_CONFIG } from "@perseus/core";
import { useCallback, useEffect, useState } from "react";
import { FileConfigLoader } from "@/services/ConfigLoader";

const configLoader = new FileConfigLoader();

/**
 * Core now types the Wikimedia provider's credential as `sessionToken`
 * (not `apiKey`, unlike OpenRouter/9Router) precisely to keep this
 * distinction visible at the type level -- see
 * `@perseus/core`'s config/Config.ts. It's a live Backend session token
 * (see services/SessionAuth.ts), not a value the user typed, and it
 * must never be written to the plaintext `perseus.config.json` file
 * (see ConfigLoader.ts / FileConfigLoader). It's blanked here right
 * before every save, regardless of how it got into the in-memory
 * config object, so there's exactly one place this rule can be
 * forgotten rather than one at every call site that might set it.
 * OpenRouter/9Router keys are unaffected -- those are the user's own
 * third-party credentials and continue to persist exactly as before.
 */
function stripSecretsForPersistence(config: PerseusConfig): PerseusConfig {
  if (config.activeProvider.kind !== "wikimedia") {
    return config;
  }

  return {
    ...config,
    activeProvider: { ...config.activeProvider, sessionToken: "" },
  };
}

export function useConfig() {
  const [config, setConfig] = useState<PerseusConfig>(DEFAULT_CONFIG);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    configLoader.load().then((loadedConfig) => {
      setConfig(loadedConfig);
      setLoaded(true);
    });
  }, []);

  const update = useCallback((next: PerseusConfig) => {
    setConfig(next);
    void configLoader.save(stripSecretsForPersistence(next));
  }, []);

  return { config, updateConfig: update, loaded };
}
