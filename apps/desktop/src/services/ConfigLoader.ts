import type { PerseusConfig } from "@perseus/core";
import { DEFAULT_CONFIG, PerseusError } from "@perseus/core";
import { appConfigDir, join } from "@tauri-apps/api/path";
import {
  exists,
  mkdir,
  readTextFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";

const CONFIG_FILE_NAME = "perseus.config.json";

interface ConfigLoader {
  load(): Promise<PerseusConfig>;
  save(config: PerseusConfig): Promise<void>;
}

async function configFilePath(): Promise<string> {
  const dir = await appConfigDir();
  return join(dir, CONFIG_FILE_NAME);
}

export class FileConfigLoader implements ConfigLoader {
  async load(): Promise<PerseusConfig> {
    try {
      const path = await configFilePath();

      if (!(await exists(path))) {
        return DEFAULT_CONFIG;
      }

      const raw = await readTextFile(path);
      return {
        ...DEFAULT_CONFIG,
        ...(JSON.parse(raw) as Partial<PerseusConfig>),
      };
    } catch {
      return DEFAULT_CONFIG;
    }
  }

  async save(config: PerseusConfig): Promise<void> {
    try {
      const dir = await appConfigDir();

      if (!(await exists(dir))) {
        await mkdir(dir, { recursive: true });
      }

      const path = await configFilePath();
      await writeTextFile(path, JSON.stringify(config, null, 2));
    } catch (error) {
      throw new PerseusError(
        "ConfigurationError",
        "Could not save Perseus configuration.",
        {
          cause: error,
        },
      );
    }
  }
}
