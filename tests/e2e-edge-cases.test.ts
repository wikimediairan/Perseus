import "./helpers/setupDom";
import { jsonResponse, setGlobalFetch, urlOf } from "./helpers/fetchMock";
import { isOllamaChatRequest, isWikidataRequest } from "./helpers/mediawikiEndpoints";

describe("Edge Cases (E2E)", () => {
  it("missing segment triggers individual fallback retry", async () => {
    let chatCallCount = 0;
    setGlobalFetch((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = urlOf(input);
      if (isOllamaChatRequest(url)) {
        chatCallCount++;
        const bodyObj = JSON.parse(init!.body as string) as { messages: { content: string }[] };
        const userMsg = bodyObj.messages[1].content;
        if (userMsg.includes("[[SEGMENT 2]]")) {
          // First call: only return SEGMENT 1, "drop" SEGMENT 2 to force fallback.
          return Promise.resolve(
            jsonResponse({ message: { content: "[[SEGMENT 1]]\nترجمه یک." } }),
          );
        }
        // Fallback individual call for the missing unit.
        return Promise.resolve(jsonResponse({ message: { content: "ترجمه دو." } }));
      }
      throw new Error("unexpected fetch: " + url);
    });

    const { SizeBoundedChunker } = await import("@core/chunker/Chunker");
    const { LLMTranslator } = await import("@core/translator/Translator");
    const { OllamaProvider } = await import("@core/llm/providers/OllamaProvider");
    const { DefaultPromptManager } = await import("@core/prompt/PromptManager");
    const { ConsoleLogger } = await import("@core/logging/Logger");
    const { TARGET_WIKIS } = await import("@core/config/targetWikis");

    const chunker = new SizeBoundedChunker();
    const chunks = await chunker.chunk([
      { nodeId: "n1", sourceText: "Sentence one." },
      { nodeId: "n2", sourceText: "Sentence two." },
    ]);
    const translator = new LLMTranslator(
      new OllamaProvider({ baseUrl: "http://localhost:11434", model: "llama3" }),
      new DefaultPromptManager(),
      TARGET_WIKIS.fa,
      new ConsoleLogger(),
    );
    const result = await translator.translate(chunks);

    expect(chatCallCount, "exactly two chat calls: initial batch + fallback").toBe(2);
    expect(result[0].units.length, "both units present in the final result").toBe(2);
    expect(
      result[0].units[0].translatedText,
      "first unit translated from the initial batch call",
    ).toBe("ترجمه یک.");
    expect(result[0].units[1].translatedText, "second unit recovered via the fallback retry").toBe(
      "ترجمه دو.",
    );
  });

  it("Reference Attention heuristics", async () => {
    const { HeuristicReferenceAttentionClassifier } =
      await import("@core/referenceAttention/ReferenceAttention");
    const { createEmptyIR } = await import("@core/ir/IntermediateRepresentation");
    const { DOMParser: DP } = await import("linkedom");
    const doc = new DP().parseFromString("<div></div>", "text/html");
    const ir = createEmptyIR("Test", doc as unknown as Document);
    ir.textNodes = [
      { id: "a", text: "The population grew by 42% last year." },
      { id: "b", text: "The treatment caused a severe reaction in some patients." },
      { id: "c", text: "It is a small town in the mountains." },
    ];

    const annotations = await new HeuristicReferenceAttentionClassifier().classify(ir);
    const byId = Object.fromEntries(annotations.map((a) => [a.nodeId, a]));

    expect(byId.a.classification, "statistic-bearing sentence flagged for review").toBe(
      "needs-human-review",
    );
    expect(byId.a.reason, "reason attributed to a statistic").toBe("statistic");
    expect(byId.b.classification, "medical-content sentence flagged for review").toBe(
      "needs-human-review",
    );
    expect(byId.b.reason, "reason attributed to medical content").toBe("medical content");
    expect(byId.c.classification, "plain descriptive sentence is fine as-is").toBe("ok");
  });

  it("Wikidata connectivity failure raises a stage-attributed PerseusError", async () => {
    setGlobalFetch((input: RequestInfo | URL): Promise<Response> => {
      const url = urlOf(input);
      if (isWikidataRequest(url)) throw new Error("network down");
      throw new Error("unexpected fetch: " + url);
    });

    const { WikidataLinkResolver } = await import("@core/linkResolver/WikidataLinkResolver");
    const { createEmptyIR } = await import("@core/ir/IntermediateRepresentation");
    const { PerseusError } = await import("@core/errors/PerseusError");
    const { TARGET_WIKIS } = await import("@core/config/targetWikis");
    const { DOMParser: DP } = await import("linkedom");
    const doc = new DP().parseFromString("<div></div>", "text/html");
    const ir = createEmptyIR("Test", doc as unknown as Document);
    ir.links = [{ id: "link-1", originalTarget: "Sun", resolvedTarget: null, label: "Sun" }];

    expect.assertions(3);
    try {
      await new WikidataLinkResolver(TARGET_WIKIS.fa).resolve(ir);
    } catch (err) {
      expect(err, "error is a PerseusError").toBeInstanceOf(PerseusError);
      expect((err as any).category, "category is LinkResolutionError").toBe("LinkResolutionError");
      expect((err as any).stage, "stage is resolve-wikidata-links").toBe("resolve-wikidata-links");
    }
  });
});
