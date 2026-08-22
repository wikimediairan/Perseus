import { describe, expect, it } from "vitest";
import type { LLMProviderConfig } from "../src/config/Config";
import {
  DEFAULT_CONFIG,
  DEFAULT_NINEROUTER_BASE_URL,
  DEFAULT_OPENROUTER_MODEL,
} from "../src/config/Config";

describe("LLMProviderConfig", () => {
  it("DEFAULT_CONFIG still defaults to OpenRouter, unchanged", () => {
    expect(DEFAULT_CONFIG.activeProvider).toEqual({
      kind: "openrouter",
      model: DEFAULT_OPENROUTER_MODEL,
      apiKey: "",
    });
  });

  it("accepts a valid config for each of the three providers", () => {
    const configs: LLMProviderConfig[] = [
      { kind: "openrouter", model: "m", apiKey: "k" },
      { kind: "9router", model: "google/gemini-2.5-flash", apiKey: "k" },
      { kind: "9router", model: "anthropic/claude-x" }, // no apiKey, baseUrl optional
      {
        kind: "9router",
        model: "kr/claude-sonnet-4.5",
        apiKey: "k",
        baseUrl: "http://localhost:20128",
      },
    ];

    expect(configs).toHaveLength(4);
  });

  it("exposes a documented default local 9Router address", () => {
    expect(DEFAULT_NINEROUTER_BASE_URL).toBe("http://localhost:20128");
  });
});
