/**
 * ConfigLoader
 *
 * Real implementation. Persists PerseusConfig as JSON in the OS-standard
 * app config directory, via the Tauri filesystem plugin. This resolves
 * the persistence question the Software Specification left open
 * (Section 14, Assumption) in favor of local file storage rather than OS
 * keychain integration — simplest option that satisfies "local-first
 * operation" (NFR-5); see README for the security note this implies for
 * provider API keys.
 */

import type { PerseusConfig } from "@core/config/Config";
import { DEFAULT_CONFIG } from "@core/config/Config";
import { PerseusError } from "@core/errors/PerseusError";
import { appConfigDir, join } from "@tauri-apps/api/path";
import { exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

const CONFIG_FILE_NAME = "perseus.config.json";

export interface ConfigLoader {
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
      // A corrupt or unreadable config file should not block the app from
      // starting — fall back to defaults rather than throwing (Spec NFR-4
      // concerns data loss on the article, not on config recovery).
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
      throw new PerseusError("ConfigurationError", "Could not save Perseus configuration.", {
        cause: error,
      });
    }
  }
}
