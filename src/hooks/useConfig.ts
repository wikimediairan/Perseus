//? Loads PerseusConfig on mount and persists changes via the existing

import type { PerseusConfig } from "@core/config/Config";
import { DEFAULT_CONFIG } from "@core/config/Config";
import { FileConfigLoader } from "@core/config/ConfigLoader";
import { useCallback, useEffect, useState } from "react";

const configLoader = new FileConfigLoader();

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
    void configLoader.save(next);
  }, []);

  return { config, updateConfig: update, loaded };
}
