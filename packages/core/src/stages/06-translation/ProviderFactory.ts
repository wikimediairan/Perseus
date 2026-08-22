import type { LLMProviderConfig } from "../../config/Config";
import { DEFAULT_NINEROUTER_BASE_URL } from "../../config/Config";
import { PerseusError } from "../../platform/errors/PerseusError";
import type { WikimediaProviderType } from "../../wikimedia-provider/contract";
import { WikimediaProvider } from "../../wikimedia-provider/WikimediaProvider";
import type { TextProviderType } from "./LLMProvider";
import { NineRouterProvider } from "./providers/NineRouterProvider";
import { OpenRouterProvider } from "./providers/OpenRouterProvider";

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
