import { jsonResponse, setGlobalFetch } from "./helpers/fetchMock";

/**
 * Verifies the Anthropic and Gemini providers speak their real wire
 * protocols correctly, and that ProviderFactory routes to them — plus
 * that Provider Abstraction still holds: the Translator/Pipeline code
 * that calls a provider never needs to know which one it got.
 */

describe("New LLM Providers (E2E)", () => {
  it("AnthropicProvider sends the correct request shape and parses the response", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;

    setGlobalFetch(((url: string, init?: RequestInit): Promise<Response> => {
      capturedUrl = url;
      capturedInit = init;
      return Promise.resolve(jsonResponse({ content: [{ type: "text", text: "ترجمه شده" }] }));
    }) as typeof fetch);

    const { AnthropicProvider } = await import("@core/llm/providers/AnthropicProvider");
    const provider = new AnthropicProvider({ apiKey: "sk-ant-test", model: "claude-sonnet-4-5" });
    const result = await provider.translate({
      systemPrompt: "Translate to Persian.",
      sourceText: "Hello.",
      targetLanguage: "fa",
    });

    const headers = capturedInit?.headers as Record<string, string>;
    const body = JSON.parse(capturedInit!.body as string) as Record<string, unknown>;

    expect(provider.kind, "provider.kind is 'anthropic'").toBe("anthropic");
    expect(capturedUrl, "correct endpoint").toBe("https://api.anthropic.com/v1/messages");
    expect(
      headers["x-api-key"] === "sk-ant-test" && !("Authorization" in headers),
      "x-api-key header set, not Authorization",
    ).toBe(true);
    expect(headers["anthropic-version"], "anthropic-version header present").toBe("2023-06-01");
    const messages = body.messages as { role: string; content: string }[];
    expect(
      body.system === "Translate to Persian." && messages.length === 1,
      "system is a top-level field, not a message",
    ).toBe(true);
    expect(
      messages[0].role === "user" && messages[0].content === "Hello.",
      "user message carries the source text",
    ).toBe(true);
    expect(body.model, "model passed through").toBe("claude-sonnet-4-5");
    expect(result.translatedText, "response text extracted from content[].text").toBe("ترجمه شده");
  });

  it("GeminiProvider sends the correct request shape and parses the response", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;

    setGlobalFetch(((url: string, init?: RequestInit): Promise<Response> => {
      capturedUrl = url;
      capturedInit = init;
      return Promise.resolve(
        jsonResponse({ candidates: [{ content: { parts: [{ text: "ترجمه شده" }] } }] }),
      );
    }) as typeof fetch);

    const { GeminiProvider } = await import("@core/llm/providers/GeminiProvider");
    const provider = new GeminiProvider({ apiKey: "goog-test-key", model: "gemini-2.5-flash" });
    const result = await provider.translate({
      systemPrompt: "Translate to Persian.",
      sourceText: "Hello.",
      targetLanguage: "fa",
    });

    const headers = capturedInit?.headers as Record<string, string>;
    const body = JSON.parse(capturedInit!.body as string) as {
      system_instruction: { parts: { text: string }[] };
      contents: { parts: { text: string }[] }[];
    };

    expect(provider.kind, "provider.kind is 'gemini'").toBe("gemini");
    expect(capturedUrl, "model is part of the URL path").toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    );
    expect(
      headers["x-goog-api-key"] === "goog-test-key" && !("Authorization" in headers),
      "x-goog-api-key header set, not Authorization",
    ).toBe(true);
    expect(
      body.system_instruction.parts[0].text,
      "system_instruction is separate from contents",
    ).toBe("Translate to Persian.");
    expect(body.contents[0].parts[0].text, "contents carries the source text as parts[].text").toBe(
      "Hello.",
    );
    expect(result.translatedText, "response text extracted from candidates[0].content.parts").toBe(
      "ترجمه شده",
    );
  });

  it("both providers refuse to call out with no API key or no model configured", async () => {
    const { AnthropicProvider } = await import("@core/llm/providers/AnthropicProvider");
    const { GeminiProvider } = await import("@core/llm/providers/GeminiProvider");
    const { PerseusError } = await import("@core/errors/PerseusError");

    setGlobalFetch(() => {
      throw new Error("must not be called when credentials are missing");
    });

    async function expectConfigError(fn: () => Promise<unknown>): Promise<boolean> {
      try {
        await fn();
        return false;
      } catch (err) {
        return err instanceof PerseusError && err.category === "ConfigurationError";
      }
    }

    const req = { systemPrompt: "x", sourceText: "y", targetLanguage: "fa" as const };

    expect(
      await expectConfigError(() =>
        new AnthropicProvider({ model: "claude-sonnet-4-5" }).translate(req),
      ),
      "Anthropic: missing API key",
    ).toBe(true);
    expect(
      await expectConfigError(() =>
        new AnthropicProvider({ apiKey: "x", model: "" }).translate(req),
      ),
      "Anthropic: missing model",
    ).toBe(true);
    expect(
      await expectConfigError(() =>
        new GeminiProvider({ model: "gemini-2.5-flash" }).translate(req),
      ),
      "Gemini: missing API key",
    ).toBe(true);
    expect(
      await expectConfigError(() => new GeminiProvider({ apiKey: "x", model: "" }).translate(req)),
      "Gemini: missing model",
    ).toBe(true);
  });

  it("ProviderFactory routes 'anthropic' and 'gemini' to the right classes", async () => {
    const { createProvider } = await import("@core/llm/ProviderFactory");
    const { AnthropicProvider } = await import("@core/llm/providers/AnthropicProvider");
    const { GeminiProvider } = await import("@core/llm/providers/GeminiProvider");

    const anthropic = createProvider({
      kind: "anthropic",
      model: "claude-sonnet-4-5",
      apiKey: "x",
    });
    const gemini = createProvider({ kind: "gemini", model: "gemini-2.5-flash", apiKey: "x" });

    expect(anthropic, "kind='anthropic' produces an AnthropicProvider").toBeInstanceOf(
      AnthropicProvider,
    );
    expect(gemini, "kind='gemini' produces a GeminiProvider").toBeInstanceOf(GeminiProvider);
    expect(
      typeof anthropic.translate === "function" && typeof gemini.translate === "function",
      "both still satisfy the common LLMProvider surface (readonly kind + translate)",
    ).toBe(true);
  });

  it("a non-2xx response from either API surfaces as a ProviderError with the vendor's message", async () => {
    const { AnthropicProvider } = await import("@core/llm/providers/AnthropicProvider");
    const { GeminiProvider } = await import("@core/llm/providers/GeminiProvider");
    const { PerseusError } = await import("@core/errors/PerseusError");
    const req = { systemPrompt: "x", sourceText: "y", targetLanguage: "fa" as const };

    setGlobalFetch(() =>
      Promise.resolve(jsonResponse({ error: { message: "invalid x-api-key" } }, 401)),
    );
    let anthropicOk = false;
    try {
      await new AnthropicProvider({ apiKey: "bad", model: "claude-sonnet-4-5" }).translate(req);
    } catch (err) {
      anthropicOk =
        err instanceof PerseusError &&
        err.category === "ProviderError" &&
        err.message.includes("invalid x-api-key");
    }

    setGlobalFetch(() =>
      Promise.resolve(jsonResponse({ error: { message: "API key not valid" } }, 400)),
    );
    let geminiOk = false;
    try {
      await new GeminiProvider({ apiKey: "bad", model: "gemini-2.5-flash" }).translate(req);
    } catch (err) {
      geminiOk =
        err instanceof PerseusError &&
        err.category === "ProviderError" &&
        err.message.includes("API key not valid");
    }

    expect(anthropicOk, "Anthropic 401 surfaces as ProviderError with vendor message").toBe(true);
    expect(geminiOk, "Gemini 400 surfaces as ProviderError with vendor message").toBe(true);
  });
});
