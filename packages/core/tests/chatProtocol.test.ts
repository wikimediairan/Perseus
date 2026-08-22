import { describe, expect, it } from "vitest";
import { chatCompletion } from "../src/stages/06-translation/chatProtocol";
import {
  lastRequestBody,
  lastRequestHeaders,
  mockFetchOnce,
  mockFetchRejectOnce,
} from "./helpers/mockFetch";

describe("chatCompletion", () => {
  it("builds the OpenAI-style request body with temperature 0.3", async () => {
    const fetchMock = mockFetchOnce(200, {
      choices: [{ message: { content: "ok" } }],
    });

    await chatCompletion({
      url: "https://example.test/v1/chat/completions",
      apiKey: "k",
      model: "m",
      systemPrompt: "sys",
      userMessage: "usr",
      providerLabel: "Test",
    });

    expect(lastRequestBody(fetchMock)).toEqual({
      model: "m",
      temperature: 0.3,
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "usr" },
      ],
    });
  });

  it("omits the Authorization header entirely when no apiKey is given", async () => {
    const fetchMock = mockFetchOnce(200, {
      choices: [{ message: { content: "ok" } }],
    });
    await chatCompletion({
      url: "https://example.test",
      model: "m",
      systemPrompt: "s",
      userMessage: "u",
      providerLabel: "Test",
    });
    expect(lastRequestHeaders(fetchMock).Authorization).toBeUndefined();
  });

  it("merges extraHeaders (e.g. OpenRouter's X-Title)", async () => {
    const fetchMock = mockFetchOnce(200, {
      choices: [{ message: { content: "ok" } }],
    });
    await chatCompletion({
      url: "https://example.test",
      apiKey: "k",
      model: "m",
      systemPrompt: "s",
      userMessage: "u",
      providerLabel: "Test",
      extraHeaders: { "X-Title": "Perseus" },
    });
    expect(lastRequestHeaders(fetchMock)["X-Title"]).toBe("Perseus");
  });

  it("throws ProviderError labeled with providerLabel on network failure", async () => {
    mockFetchRejectOnce(new Error("boom"));
    await expect(
      chatCompletion({
        url: "https://example.test",
        model: "m",
        systemPrompt: "s",
        userMessage: "u",
        providerLabel: "Test",
      }),
    ).rejects.toMatchObject({
      category: "ProviderError",
      message: expect.stringContaining("Test"),
    });
  });

  it("throws ProviderError on non-2xx with the response error message included", async () => {
    mockFetchOnce(429, { error: { message: "rate limited" } });
    await expect(
      chatCompletion({
        url: "https://example.test",
        model: "m",
        systemPrompt: "s",
        userMessage: "u",
        providerLabel: "Test",
      }),
    ).rejects.toMatchObject({
      category: "ProviderError",
      message: expect.stringContaining("rate limited"),
    });
  });

  it("throws ProviderError on an empty/whitespace-only completion", async () => {
    mockFetchOnce(200, { choices: [{ message: { content: "   " } }] });
    await expect(
      chatCompletion({
        url: "https://example.test",
        model: "m",
        systemPrompt: "s",
        userMessage: "u",
        providerLabel: "Test",
      }),
    ).rejects.toMatchObject({ category: "ProviderError" });
  });
});

describe("chatCompletion — usage extraction", () => {
  it("OpenRouter-like response: full token counts + cost are both reported", async () => {
    mockFetchOnce(200, {
      choices: [{ message: { content: "ok" } }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        cost: 0.001,
      },
    });
    const result = await chatCompletion({
      url: "https://example.test",
      model: "m",
      systemPrompt: "s",
      userMessage: "u",
      providerLabel: "Test",
    });
    expect(result.usage).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      cost: 0.001,
    });
  });

  it("9Router-like response: token counts only, cost is undefined (not zero, not omitted-as-absent)", async () => {
    mockFetchOnce(200, {
      choices: [{ message: { content: "ok" } }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      },
    });
    const result = await chatCompletion({
      url: "https://example.test",
      model: "m",
      systemPrompt: "s",
      userMessage: "u",
      providerLabel: "Test",
    });
    expect(result.usage).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });
    expect(result.usage?.cost).toBeUndefined();
    expect("cost" in (result.usage ?? {})).toBe(false);
  });

  it("no usage field at all: result.usage is undefined", async () => {
    mockFetchOnce(200, { choices: [{ message: { content: "ok" } }] });
    const result = await chatCompletion({
      url: "https://example.test",
      model: "m",
      systemPrompt: "s",
      userMessage: "u",
      providerLabel: "Test",
    });
    expect(result.usage).toBeUndefined();
  });

  it("incomplete token counts (e.g. only prompt_tokens): does not fabricate zeros for the missing fields, returns undefined", async () => {
    mockFetchOnce(200, {
      choices: [{ message: { content: "ok" } }],
      usage: { prompt_tokens: 100 },
    });
    const result = await chatCompletion({
      url: "https://example.test",
      model: "m",
      systemPrompt: "s",
      userMessage: "u",
      providerLabel: "Test",
    });
    expect(result.usage).toBeUndefined();
  });

  it("cost reported with no token counts at all: does not fabricate promptTokens: 0 etc., returns undefined", async () => {
    mockFetchOnce(200, {
      choices: [{ message: { content: "ok" } }],
      usage: { cost: 0.0004 },
    });
    const result = await chatCompletion({
      url: "https://example.test",
      model: "m",
      systemPrompt: "s",
      userMessage: "u",
      providerLabel: "Test",
    });
    expect(result.usage).toBeUndefined();
  });
});
