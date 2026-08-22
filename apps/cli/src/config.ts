/**
 * CLI configuration
 *
 * Replaces Core's `config/ConfigLoader.ts` (Tauri filesystem plugin —
 * Desktop-specific, excluded from this CLI). The CLI's configuration
 * surface is intentionally tiny: which OpenRouter model to use and
 * which target wiki to translate into, both overridable by flag, plus
 * the OpenRouter API key, which per the requirements must come from an
 * environment variable and must never be hard-coded or persisted in a
 * Translation Session.
 */

import type { PerseusConfig, TargetWikiCode } from "@perseus/core";
import {
  DEFAULT_OPENROUTER_MODEL,
  DEFAULT_TARGET_WIKI,
  isTargetWikiCode,
  PerseusError,
} from "@perseus/core";

export interface CliConfigOptions {
  model?: string;
  targetWiki?: string;
  apiKey?: string;
}

/** Reads OPENROUTER_API_KEY from the environment. Never hard-coded, never stored in a session file. */
function readApiKeyFromEnv(): string | undefined {
  return process.env.OPENROUTER_API_KEY?.trim() || undefined;
}

export function buildPerseusConfig(options: CliConfigOptions): PerseusConfig {
  const apiKey = options.apiKey ?? readApiKeyFromEnv();

  if (!apiKey) {
    throw new PerseusError(
      "ConfigurationError",
      "No OpenRouter API key configured. Set the OPENROUTER_API_KEY environment variable.",
    );
  }

  const targetWikiRaw = options.targetWiki ?? DEFAULT_TARGET_WIKI;

  if (!isTargetWikiCode(targetWikiRaw)) {
    throw new PerseusError(
      "ConfigurationError",
      `Unsupported target wiki "${targetWikiRaw}". Supported: fa, tj.`,
    );
  }

  const targetWiki: TargetWikiCode = targetWikiRaw;

  return {
    activeProvider: {
      kind: "openrouter",
      model: options.model ?? DEFAULT_OPENROUTER_MODEL,
      apiKey,
    },
    prompt: {
      userPrompt: undefined,
    },
    targetWiki,
  };
}
