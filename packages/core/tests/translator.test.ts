import { describe, expect, it, vi } from "vitest";
import { getTargetWiki } from "../src/config/targetWikis";
import { ConsoleLogger } from "../src/platform/logging/Logger";
import type { Chunk } from "../src/stages/05-chunking/Chunker";
import { computeChunkFingerprint } from "../src/stages/05-chunking/segmentProtocol";
import type {
  TextProviderType,
  TranslationRequest,
  TranslationResponse,
} from "../src/stages/06-translation/LLMProvider";
import { DefaultPromptManager } from "../src/stages/06-translation/PromptManager";
import { LLMTranslator } from "../src/stages/06-translation/Translator";

function fakeProvider(
  responses: TranslationResponse[],
): TextProviderType & { calls: TranslationRequest[] } {
  const calls: TranslationRequest[] = [];
  let i = 0;
  return {
    kind: "openrouter",
    calls,
    translate: vi.fn(async (request: TranslationRequest) => {
      calls.push(request);
      return responses[i++];
    }),
  };
}

const chunk: Chunk = {
  id: "chunk-1",
  units: [
    { nodeId: "text-1", sourceText: "Hello" },
    { nodeId: "text-2", sourceText: "World" },
  ],
};

/** Prepends the chunk's own correct `[[PERSEUS CHUNK ...]]` identity line — what a well-behaved provider (or a correctly-pasted response) always includes. */
function withIdentity(c: Chunk, body: string): string {
  return `[[PERSEUS CHUNK ${c.id} ${computeChunkFingerprint(c)}]]\n${body}`;
}

describe("LLMTranslator — usage aggregation", () => {
  it("attaches the single call's usage to the chunk when nothing is missing", async () => {
    const provider = fakeProvider([
      {
        translatedText: withIdentity(
          chunk,
          "[[SEGMENT 1]]\nسلام\n\n[[SEGMENT 2]]\nدنیا",
        ),
        usage: {
          promptTokens: 100,
          completionTokens: 20,
          totalTokens: 120,
          cost: 0.001,
        },
      },
    ]);
    const translator = new LLMTranslator(
      provider,
      new DefaultPromptManager(),
      getTargetWiki("fa"),
      new ConsoleLogger(),
    );

    const result = await translator.translateChunk(chunk);

    expect(result.usage).toEqual({
      promptTokens: 100,
      completionTokens: 20,
      totalTokens: 120,
      cost: 0.001,
    });
  });

  it("sums usage across the initial call and per-unit retries", async () => {
    const provider = fakeProvider([
      // Only segment 1 comes back — segment 2 is retried individually.
      {
        translatedText: withIdentity(chunk, "[[SEGMENT 1]]\nسلام"),
        usage: {
          promptTokens: 50,
          completionTokens: 10,
          totalTokens: 60,
          cost: 0.0005,
        },
      },
      {
        translatedText: "دنیا",
        usage: {
          promptTokens: 20,
          completionTokens: 5,
          totalTokens: 25,
          cost: 0.0002,
        },
      },
    ]);
    const translator = new LLMTranslator(
      provider,
      new DefaultPromptManager(),
      getTargetWiki("fa"),
      new ConsoleLogger(),
    );

    const result = await translator.translateChunk(chunk);

    expect(result.usage).toEqual({
      promptTokens: 70,
      completionTokens: 15,
      totalTokens: 85,
      cost: 0.0007,
    });
    expect(result.units.map((u) => u.nodeId)).toEqual(["text-1", "text-2"]);
  });

  it("omits cost from the total (but still sums tokens) when any call didn't report one", async () => {
    const provider = fakeProvider([
      {
        translatedText: withIdentity(chunk, "[[SEGMENT 1]]\nسلام"),
        usage: { promptTokens: 50, completionTokens: 10, totalTokens: 60 },
      },
      {
        translatedText: "دنیا",
        usage: {
          promptTokens: 20,
          completionTokens: 5,
          totalTokens: 25,
          cost: 0.0002,
        },
      },
    ]);
    const translator = new LLMTranslator(
      provider,
      new DefaultPromptManager(),
      getTargetWiki("fa"),
      new ConsoleLogger(),
    );

    const result = await translator.translateChunk(chunk);

    expect(result.usage).toEqual({
      promptTokens: 70,
      completionTokens: 15,
      totalTokens: 85,
    });
  });

  it("usage is undefined on the chunk when the provider never reports it", async () => {
    const provider = fakeProvider([
      {
        translatedText: withIdentity(
          chunk,
          "[[SEGMENT 1]]\nسلام\n\n[[SEGMENT 2]]\nدنیا",
        ),
      },
    ]);
    const translator = new LLMTranslator(
      provider,
      new DefaultPromptManager(),
      getTargetWiki("fa"),
      new ConsoleLogger(),
    );

    const result = await translator.translateChunk(chunk);
    expect(result.usage).toBeUndefined();
  });
});

describe("LLMTranslator — chunk identity (Layer 1)", () => {
  it("retries once, whole-chunk, if the model's response is missing the identity line, and succeeds if the retry has it", async () => {
    const provider = fakeProvider([
      // First attempt: model forgot to echo the identity line.
      { translatedText: "[[SEGMENT 1]]\nسلام\n\n[[SEGMENT 2]]\nدنیا" },
      // Retry: correct.
      {
        translatedText: withIdentity(
          chunk,
          "[[SEGMENT 1]]\nسلام\n\n[[SEGMENT 2]]\nدنیا",
        ),
      },
    ]);
    const translator = new LLMTranslator(
      provider,
      new DefaultPromptManager(),
      getTargetWiki("fa"),
      new ConsoleLogger(),
    );

    const result = await translator.translateChunk(chunk);

    expect(provider.calls).toHaveLength(2);
    expect(result.units.map((u) => u.translatedText)).toEqual(["سلام", "دنیا"]);
  });

  it("propagates ChunkIdentityError if the identity line is still missing after one retry (no unbounded retry loop)", async () => {
    const provider = fakeProvider([
      { translatedText: "[[SEGMENT 1]]\nسلام\n\n[[SEGMENT 2]]\nدنیا" },
      { translatedText: "[[SEGMENT 1]]\nسلام\n\n[[SEGMENT 2]]\nدنیا" },
    ]);
    const translator = new LLMTranslator(
      provider,
      new DefaultPromptManager(),
      getTargetWiki("fa"),
      new ConsoleLogger(),
    );

    await expect(translator.translateChunk(chunk)).rejects.toMatchObject({
      category: "ChunkIdentityError",
    });
    expect(provider.calls).toHaveLength(2);
  });
});
