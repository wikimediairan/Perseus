import { describe, expect, it } from "vitest";
import { PerseusError } from "../src/platform/errors/PerseusError";
import { NineRouterProvider } from "../src/stages/06-translation/providers/NineRouterProvider";
import {
  lastRequestBody,
  lastRequestHeaders,
  lastRequestUrl,
  mockFetchOnce,
} from "./helpers/mockFetch";

describe("NineRouterProvider — generic OpenAI-compatible gateway", () => {
  it("sends the exact request shape (url, headers, body, temperature)", async () => {
    const fetchMock = mockFetchOnce(200, {
      choices: [{ message: { content: "ترجمه" } }],
    });

    const provider = new NineRouterProvider({
      apiKey: "sk-test",
      model: "google/gemini-2.5-flash",
      baseUrl: "http://localhost:20128",
    });
    const result = await provider.translate({
      systemPrompt: "You are a translator.",
      sourceText: "Hello",
      targetLanguage: "fa",
    });

    expect(result.translatedText).toBe("ترجمه");
    expect(lastRequestUrl(fetchMock)).toBe(
      "http://localhost:20128/v1/chat/completions",
    );

    const headers = lastRequestHeaders(fetchMock);
    expect(headers.Authorization).toBe("Bearer sk-test");

    expect(lastRequestBody(fetchMock)).toEqual({
      model: "google/gemini-2.5-flash",
      temperature: 0.3,
      messages: [
        { role: "system", content: "You are a translator." },
        { role: "user", content: "Hello" },
      ],
    });
  });

  it("strips a trailing slash from baseUrl before building the endpoint", async () => {
    const fetchMock = mockFetchOnce(200, {
      choices: [{ message: { content: "ok" } }],
    });
    const provider = new NineRouterProvider({
      model: "m",
      baseUrl: "http://localhost:20128/",
    });

    await provider.translate({
      systemPrompt: "s",
      sourceText: "t",
      targetLanguage: "fa",
    });

    expect(lastRequestUrl(fetchMock)).toBe(
      "http://localhost:20128/v1/chat/completions",
    );
  });

  it.each([
    "google/gemini-2.5-flash",
    "anthropic/claude-sonnet-x",
    "openai/gpt-5-mini",
    "kr/claude-sonnet-4.5",
    "local/self-hosted-model",
  ])(
    "the same provider class works for arbitrary routed model %s, with no vendor-specific branching",
    async (model) => {
      const fetchMock = mockFetchOnce(200, {
        choices: [{ message: { content: "ok" } }],
      });
      const provider = new NineRouterProvider({
        model,
        baseUrl: "http://localhost:20128",
      });

      const result = await provider.translate({
        systemPrompt: "s",
        sourceText: "t",
        targetLanguage: "fa",
      });

      expect(result.translatedText).toBe("ok");
      expect(lastRequestBody(fetchMock)).toMatchObject({ model });
    },
  );

  it("propagates token usage without cost — 9Router's chat completions endpoint doesn't report cost, and NineRouterProvider must not invent one", async () => {
    mockFetchOnce(200, {
      choices: [{ message: { content: "ok" } }],
      usage: { prompt_tokens: 80, completion_tokens: 30, total_tokens: 110 },
    });
    const provider = new NineRouterProvider({
      model: "m",
      baseUrl: "http://localhost:20128",
    });

    const result = await provider.translate({
      systemPrompt: "s",
      sourceText: "t",
      targetLanguage: "fa",
    });

    expect(result.usage).toEqual({
      promptTokens: 80,
      completionTokens: 30,
      totalTokens: 110,
    });
    expect("cost" in (result.usage ?? {})).toBe(false);
  });

  it("does not require an API key (9Router can run without auth, e.g. behind a local-only deployment)", async () => {
    mockFetchOnce(200, { choices: [{ message: { content: "ok" } }] });
    const provider = new NineRouterProvider({
      model: "m",
      baseUrl: "http://localhost:20128",
    });

    const result = await provider.translate({
      systemPrompt: "s",
      sourceText: "t",
      targetLanguage: "fa",
    });

    expect(result.translatedText).toBe("ok");
  });

  it("throws ConfigurationError for a missing model", async () => {
    const provider = new NineRouterProvider({
      model: "",
      baseUrl: "http://localhost:20128",
    });
    await expect(
      provider.translate({
        systemPrompt: "s",
        sourceText: "t",
        targetLanguage: "fa",
      }),
    ).rejects.toMatchObject({ category: "ConfigurationError" });
  });

  it("throws ProviderError on HTTP failure", async () => {
    mockFetchOnce(500, { error: { message: "server error" } });
    const provider = new NineRouterProvider({
      model: "m",
      baseUrl: "http://localhost:20128",
    });
    await expect(
      provider.translate({
        systemPrompt: "s",
        sourceText: "t",
        targetLanguage: "fa",
      }),
    ).rejects.toMatchObject({ category: "ProviderError" });
  });

  it("throws ProviderError on an empty translation", async () => {
    mockFetchOnce(200, { choices: [{ message: { content: "" } }] });
    const provider = new NineRouterProvider({
      model: "m",
      baseUrl: "http://localhost:20128",
    });
    await expect(
      provider.translate({
        systemPrompt: "s",
        sourceText: "t",
        targetLanguage: "fa",
      }),
    ).rejects.toMatchObject({ category: "ProviderError" });
  });

  it("errors are PerseusError instances", async () => {
    const provider = new NineRouterProvider({
      model: "",
      baseUrl: "http://localhost:20128",
    });
    try {
      await provider.translate({
        systemPrompt: "s",
        sourceText: "t",
        targetLanguage: "fa",
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(PerseusError);
    }
  });
});
