import { describe, expect, it, vi } from "vitest";
import type { LLMProviderConfig } from "../src/config/Config";
import { DEFAULT_NINEROUTER_BASE_URL } from "../src/config/Config";
import { createProvider } from "../src/stages/06-translation/ProviderFactory";
import { NineRouterProvider } from "../src/stages/06-translation/providers/NineRouterProvider";
import { OpenRouterProvider } from "../src/stages/06-translation/providers/OpenRouterProvider";
import { lastRequestUrl, mockFetchOnce } from "./helpers/mockFetch";

describe("createProvider", () => {
  it("builds an OpenRouterProvider for kind: openrouter", () => {
    const provider = createProvider({
      kind: "openrouter",
      model: "m",
      apiKey: "k",
    });
    expect(provider).toBeInstanceOf(OpenRouterProvider);
    expect(provider.kind).toBe("openrouter");
  });

  it("builds a NineRouterProvider for kind: 9router, with an explicit baseUrl", () => {
    const provider = createProvider({
      kind: "9router",
      model: "google/gemini-2.5-flash",
      apiKey: "k",
      baseUrl: "http://my-server:20128",
    });
    expect(provider).toBeInstanceOf(NineRouterProvider);
    expect(provider.kind).toBe("9router");
  });

  it("falls back to DEFAULT_NINEROUTER_BASE_URL when baseUrl is omitted", async () => {
    const provider = createProvider({
      kind: "9router",
      model: "kr/claude-sonnet-4.5",
      apiKey: "k",
    });
    const fetchMock = mockFetchOnce(200, {
      choices: [{ message: { content: "ok" } }],
    });

    await (provider as NineRouterProvider).translate({
      systemPrompt: "s",
      sourceText: "t",
      targetLanguage: "fa",
    });

    expect(lastRequestUrl(fetchMock)).toBe(
      `${DEFAULT_NINEROUTER_BASE_URL}/v1/chat/completions`,
    );
    vi.unstubAllGlobals();
  });

  it("does not require an API key for 9Router", () => {
    expect(() =>
      createProvider({ kind: "9router", model: "kr/claude-sonnet-4.5" }),
    ).not.toThrow();
  });

  it("builds a WikimediaProvider for kind: wikimedia", () => {
    const provider = createProvider({
      kind: "wikimedia",
      model: "deepseek/deepseek-v4-pro",
      sessionToken: "k",
    });
    expect(provider.kind).toBe("wikimedia");
  });

  it("Wikimedia's credential is a session token, not an apiKey field", () => {
    const config: LLMProviderConfig = {
      kind: "wikimedia",
      model: "deepseek/deepseek-v4-pro",
      sessionToken: "some-perseus-session-token",
    };
    // @ts-expect-error -- apiKey is not part of WikimediaProviderConfig;
    // this is exactly the mix-up the sessionToken rename exists to catch
    // at compile time rather than silently sending `undefined` as the
    // bearer credential.
    expect(config.apiKey).toBeUndefined();
  });
});
