import { describe, expect, it } from "vitest";
import { PerseusError } from "../src/platform/errors/PerseusError";
import { OpenRouterProvider } from "../src/stages/06-translation/providers/OpenRouterProvider";
import {
  lastRequestBody,
  lastRequestHeaders,
  lastRequestUrl,
  mockFetchOnce,
} from "./helpers/mockFetch";

describe("OpenRouterProvider — unchanged wire behavior", () => {
  it("sends the exact request shape (url, headers, body, temperature) as before this phase", async () => {
    const fetchMock = mockFetchOnce(200, {
      choices: [{ message: { content: "ترجمه" } }],
    });

    const provider = new OpenRouterProvider({
      apiKey: "sk-test",
      model: "google/gemini-2.5-flash",
    });
    const result = await provider.translate({
      systemPrompt: "You are a translator.",
      sourceText: "Hello",
      targetLanguage: "fa",
    });

    expect(result.translatedText).toBe("ترجمه");
    expect(lastRequestUrl(fetchMock)).toBe(
      "https://openrouter.ai/api/v1/chat/completions",
    );

    const headers = lastRequestHeaders(fetchMock);
    expect(headers.Authorization).toBe("Bearer sk-test");
    expect(headers["X-Title"]).toBe("Perseus");

    expect(lastRequestBody(fetchMock)).toEqual({
      model: "google/gemini-2.5-flash",
      temperature: 0.3,
      messages: [
        { role: "system", content: "You are a translator." },
        { role: "user", content: "Hello" },
      ],
    });
  });

  it("passes through usage/cost from the response when the API reports it", async () => {
    mockFetchOnce(200, {
      choices: [{ message: { content: "ترجمه" } }],
      usage: {
        prompt_tokens: 120,
        completion_tokens: 40,
        total_tokens: 160,
        cost: 0.0021,
      },
    });
    const provider = new OpenRouterProvider({ apiKey: "k", model: "m" });
    const result = await provider.translate({
      systemPrompt: "s",
      sourceText: "t",
      targetLanguage: "fa",
    });

    expect(result.usage).toEqual({
      promptTokens: 120,
      completionTokens: 40,
      totalTokens: 160,
      cost: 0.0021,
    });
  });

  it("usage is undefined when the response doesn't include it", async () => {
    mockFetchOnce(200, { choices: [{ message: { content: "ok" } }] });
    const provider = new OpenRouterProvider({ apiKey: "k", model: "m" });
    const result = await provider.translate({
      systemPrompt: "s",
      sourceText: "t",
      targetLanguage: "fa",
    });

    expect(result.usage).toBeUndefined();
  });

  it("still throws ConfigurationError for a missing API key", async () => {
    const provider = new OpenRouterProvider({ model: "m" });
    await expect(
      provider.translate({
        systemPrompt: "s",
        sourceText: "t",
        targetLanguage: "fa",
      }),
    ).rejects.toMatchObject({ category: "ConfigurationError" });
  });

  it("still throws ConfigurationError for a missing model", async () => {
    const provider = new OpenRouterProvider({ apiKey: "k", model: "" });
    await expect(
      provider.translate({
        systemPrompt: "s",
        sourceText: "t",
        targetLanguage: "fa",
      }),
    ).rejects.toMatchObject({ category: "ConfigurationError" });
  });

  it("still throws ProviderError on HTTP failure", async () => {
    mockFetchOnce(500, { error: "server error" });
    const provider = new OpenRouterProvider({ apiKey: "k", model: "m" });
    await expect(
      provider.translate({
        systemPrompt: "s",
        sourceText: "t",
        targetLanguage: "fa",
      }),
    ).rejects.toMatchObject({ category: "ProviderError" });
  });

  it("still throws ProviderError on an empty translation", async () => {
    mockFetchOnce(200, { choices: [{ message: { content: "" } }] });
    const provider = new OpenRouterProvider({ apiKey: "k", model: "m" });
    await expect(
      provider.translate({
        systemPrompt: "s",
        sourceText: "t",
        targetLanguage: "fa",
      }),
    ).rejects.toMatchObject({ category: "ProviderError" });
  });

  it("errors are still PerseusError instances (no new error model introduced)", async () => {
    const provider = new OpenRouterProvider({ model: "m" });
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
