import type { LLMProviderConfig } from "../../config/Config.js";
import { DEFAULT_NINEROUTER_BASE_URL } from "../../config/Config.js";
import { PerseusError } from "../../platform/errors/PerseusError.js";
import type { WikimediaProviderType } from "../../wikimedia-provider/contract.js";
import { WikimediaProvider } from "../../wikimedia-provider/WikimediaProvider.js";
import type { TextProviderType } from "./LLMProvider.js";
import { NineRouterProvider } from "./providers/NineRouterProvider.js";
import { OpenRouterProvider } from "./providers/OpenRouterProvider.js";

export function createProvider(
  config: LLMProviderConfig,
): TextProviderType | WikimediaProviderType {
  switch (config.kind) {
    case "openrouter": {
      return new OpenRouterProvider({
        apiKey: config.apiKey,
        model: config.model,
      });
    }

    case "9router": {
      return new NineRouterProvider({
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.baseUrl ?? DEFAULT_NINEROUTER_BASE_URL,
      });
    }

    case "wikimedia": {
      return new WikimediaProvider(config.sessionToken);
    }

    default: {
      const _exhaustive: never = config;
      throw new PerseusError("ConfigurationError", "Unknown LLM provider");
    }
  }
}
