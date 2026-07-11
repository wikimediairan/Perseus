import { DOMParser } from "linkedom";

(globalThis as any).DOMParser = DOMParser;

/**
 * Verifies the self-contained Translation Session (Unified Chunk
 * Architecture):
 *   - export captures a snapshot + provenance, separate from the
 *     chunk-grouped, compact numeric translation tuples
 *   - a chunk exported for external translation and a chunk consumed by
 *     the built-in LLM executor are the exact same shape/ids
 *   - import reconstructs the article ENTIRELY from that snapshot — no
 *     network calls to Wikipedia/Wikidata at all
 *   - a "changed" article on the live wiki does not affect import,
 *     because import never touches the live wiki
 *   - unknown ids are ignored, duplicate ids abort with a clear error
 *   - ids are stable across two independent exports of the same article
 */

const ARTICLE_HTML =
  `<p>The <a rel="mw:WikiLink" href="./Sun">Sun</a> is a star.</p>` +
  `<h2>Formation</h2>` +
  `<p>It formed 4.6 billion years ago.</p>`;

function mockFetch(overrides: { articleHtml?: string; wikidataUnreachable?: boolean; forbidHtmlFetch?: boolean } = {}) {
  return async (url: string) => {
    if (url.includes("/w/rest.php/v1/page/")) return { ok: true, status: 200, json: async () => ({ title: "Sun", source: "x" }) } as Response;
    if (url.includes("/api/rest_v1/transform/wikitext/to/html/")) {
      if (overrides.forbidHtmlFetch) throw new Error("Reconstruction must never call Parsoid's transform endpoint");
      return { ok: true, status: 200, text: async () => overrides.articleHtml ?? ARTICLE_HTML } as Response;
    }
    if (url.includes("/api/rest_v1/transform/html/to/wikitext/")) {
      return { ok: true, status: 200, text: async () => "GENERATED" } as Response;
    }
    if (url.includes("wikidata.org")) {
      if (overrides.wikidataUnreachable) throw new Error("Reconstruction must never contact Wikidata");
      return {
        ok: true,
        status: 200,
        json: async () => ({ entities: { Q1: { sitelinks: { enwiki: { title: "Sun" }, fawiki: { title: "خورشید" } } } } }),
      } as Response;
    }
    throw new Error("unexpected fetch: " + url);
  };
}

const CHUNK_CHAR_BUDGET = 2500;

async function exportFreshSession() {
  (globalThis as any).fetch = mockFetch();
  const { createPipeline } = await import("@core/createPipeline");
  const { DEFAULT_CONFIG } = await import("@core/config/Config");
  const { ConsoleLogger } = await import("@core/logging/Logger");
  const { exportTranslationSession } = await import("@core/translationPackage/export");

  const pipeline = createPipeline(DEFAULT_CONFIG, new ConsoleLogger());
  const extraction = await pipeline.runToExtraction({ kind: "url", url: "https://en.wikipedia.org/wiki/Sun" });
  const chunks = await pipeline.deriveChunks(extraction.worklist);
  return { pipeline, extraction, chunks, session: exportTranslationSession(extraction, chunks, CHUNK_CHAR_BUDGET) };
}

describe("Translation Session (E2E)", () => {
  it("export produces the new snapshot/provenance/chunks shape", async () => {
    const { session } = await exportFreshSession();

    expect(session.format, "format marks this as a Perseus package").toBe("perseus-package");
    expect(session.formatVersion, "formatVersion is set").toBe(2);
    expect(session.meta.articleTitle, "meta.articleTitle matches").toBe("Sun");
    expect(session.meta.targetWiki, "meta.targetWiki defaults to fa").toBe("fa");
    expect(session.meta.chunkCharBudget, "meta.chunkCharBudget recorded").toBe(CHUNK_CHAR_BUDGET);
    expect(
      session.snapshot.parsoidHtml.includes(encodeURIComponent("خورشید")),
      "snapshot.parsoidHtml contains the resolved Persian link href",
    ).toBe(true);
    expect(session.provenance.rawWikitext, "provenance.rawWikitext is present and distinct from snapshot").toBe("x");

    const allTuples = session.chunks.flatMap((c) => c.translation);
    expect(allTuples.length, "3 compact tuples across all chunks").toBe(3);
    expect(allTuples.every(([id]) => typeof id === "number"), "tuple ids are small numbers, not 'text-N' strings").toBe(true);
    expect(allTuples.map(([, tag]) => tag).join(","), "tuple tags are raw HTML tag names").toBe("p,h2,p");
    expect(allTuples.every((t) => t.length === 3), "no separate 'source' field anywhere (tuple length is exactly 3)").toBe(true);
    expect(session.chunks.every((c) => typeof c.id === "string"), "chunk ids are strings, matching the in-memory Chunk type").toBe(true);
  });

  it("a chunk exported for external translation is exactly what the built-in executor would translate", async () => {
    const { chunks } = await exportFreshSession();
    const { renderChunkForTranslation } = await import("@core/chunker/segmentProtocol");

    // The text a "Copy" button would put on the clipboard is rendered by the exact
    // same function the built-in LLMTranslator uses as its request body — see
    // Translator.translateChunk. There is no separate "external" rendering path.
    const rendered = renderChunkForTranslation(chunks[0]);
    expect(rendered.includes("[[SEGMENT 1]]"), "rendered chunk uses the shared segment wire format").toBe(true);
  });

  it("import reconstructs and completes WITHOUT touching Wikipedia or Wikidata", async () => {
    const { session } = await exportFreshSession();

    // Fill in translations exactly like an external AI (or the built-in executor) would.
    const filled = JSON.parse(JSON.stringify(session));
    filled.chunks[0].translation[0][2] = filled.chunks[0].translation[0][2]
      .replace("Sun", "\u27EA1\u27EBخورشید\u27EA/1\u27EB")
      .replace("is a star.", "است.");
    // second chunk/entry left untouched -> should remain in its original English form.

    // Now simulate the article having disappeared / Wikidata being unreachable — import must not care.
    (globalThis as any).fetch = mockFetch({ forbidHtmlFetch: true, wikidataUnreachable: true });

    const { createPipeline } = await import("@core/createPipeline");
    const { DEFAULT_CONFIG } = await import("@core/config/Config");
    const { ConsoleLogger } = await import("@core/logging/Logger");
    const pipeline = createPipeline(DEFAULT_CONFIG, new ConsoleLogger());

    const result = await pipeline.continueWithSavedSession(filled);

    expect(result, "resume completed without any network call to Wikipedia/Wikidata").toBeTruthy();
  });

  it("reconstructed HTML reflects translations, untouched entries keep their original text, progress is accurate", async () => {
    const { session } = await exportFreshSession();

    const filled = JSON.parse(JSON.stringify(session));
    const allTranslations = filled.chunks.flatMap((c: any) => c.translation);
    allTranslations[0][2] = allTranslations[0][2]
      .replace("Sun", "\u27EA1\u27EBخورشید\u27EA/1\u27EB")
      .replace("is a star.", "است.");
    allTranslations[1][2] = "شکل‌گیری";
    // allTranslations[2] left exactly as exported -> untouched.

    let capturedHtml = "";
    (globalThis as any).fetch = async (url: string, init?: RequestInit) => {
      if (url.includes("/api/rest_v1/transform/html/to/wikitext/")) {
        capturedHtml = JSON.parse(init!.body as string).html;
        return { ok: true, status: 200, text: async () => "GENERATED" } as Response;
      }
      throw new Error("unexpected fetch during reconstruction: " + url);
    };

    const { createPipeline } = await import("@core/createPipeline");
    const { DEFAULT_CONFIG } = await import("@core/config/Config");
    const { ConsoleLogger } = await import("@core/logging/Logger");
    const pipeline = createPipeline(DEFAULT_CONFIG, new ConsoleLogger());

    const result = await pipeline.continueWithSavedSession(filled);

    expect(result.wikitext, "pipeline completed").toBe("GENERATED");
    expect(
      capturedHtml.includes("خورشید") && capturedHtml.includes("است"),
      "translated paragraph text made it into the reconstructed HTML",
    ).toBe(true);
    expect(capturedHtml.includes("شکل‌گیری"), "translated heading made it into the reconstructed HTML").toBe(true);
    expect(capturedHtml.includes("4.6 billion years ago"), "untouched third entry kept its ORIGINAL English text").toBe(true);
    expect(
      result.progress.translated === 2 && result.progress.total === 3 && result.progress.percent === 67,
      "progress reports 2/3 translated (67%)",
    ).toBe(true);
  });

  it("unknown ids ignored during apply; duplicate ids rejected at the validation boundary", async () => {
    const { session } = await exportFreshSession();
    const { PerseusError } = await import("@core/errors/PerseusError");
    const { createPipeline } = await import("@core/createPipeline");
    const { DEFAULT_CONFIG } = await import("@core/config/Config");
    const { ConsoleLogger } = await import("@core/logging/Logger");
    const { validateTranslationSession } = await import("@core/translationPackage/validate");

    (globalThis as any).fetch = async (url: string) => {
      if (url.includes("/api/rest_v1/transform/html/to/wikitext/")) return { ok: true, status: 200, text: async () => "GENERATED" } as Response;
      throw new Error("unexpected fetch: " + url);
    };

    // Unknown id should be ignored by apply, not throw — this is a session that
    // already passed validation (e.g. entries referring to a node that existed
    // in some other snapshot) but doesn't match THIS session's own snapshot ids,
    // which can't normally happen for a self-consistent session but is still
    // handled gracefully rather than assumed impossible.
    const withUnknown = JSON.parse(JSON.stringify(session));
    withUnknown.chunks[0].translation.push([9999, "p", "Ghost entry"]);
    const pipeline1 = createPipeline(DEFAULT_CONFIG, new ConsoleLogger());
    const result1 = await pipeline1.continueWithSavedSession(withUnknown);

    expect(
      result1.ignoredUnknownIds.includes("text-9999") && result1.wikitext === "GENERATED",
      "unknown id ignored, pipeline still completes",
    ).toBe(true);

    // Duplicate ids are rejected at the validation boundary (validateTranslationSession) —
    // the same boundary OutputDelivery.openSession() calls before a session ever reaches
    // the Pipeline. Pipeline.continueWithSavedSession itself correctly assumes its
    // input has already passed through that boundary, exactly like every other stage
    // assumes its IR input is already well-formed.
    const withDuplicate = JSON.parse(JSON.stringify(session));
    withDuplicate.chunks[0].translation.push([withDuplicate.chunks[0].translation[0][0], "p", "Duplicate"]);
    let duplicateOk = false;
    try {
      validateTranslationSession(withDuplicate);
    } catch (err) {
      duplicateOk = err instanceof PerseusError && err.category === "InputError" && /duplicate/i.test(err.message);
    }
    expect(duplicateOk, "duplicate id rejected by validateTranslationSession with a clear InputError").toBe(true);
  });

  it("re-exporting after merging some chunks keeps the snapshot pristine, so a SECOND reopen still reports accurate progress", async () => {
    // This guards against a real bug caught during implementation: exportTranslationSession
    // must never re-read the snapshot from the (mutable) live IR, since Merge mutates it in
    // place. If it did, saving mid-session would silently bake already-translated text into
    // the reconstruction anchor, and a later reopen's diff-based progress would undercount.
    const { pipeline, extraction, chunks } = await exportFreshSession();
    const { exportTranslationSession } = await import("@core/translationPackage/export");

    // Merge a translation for chunk 1 directly (no real LLM call needed — mergeChunk is
    // pure/local), simulating a chunk that finished translating earlier in this session.
    const translated = {
      id: chunks[0].id,
      units: chunks[0].units.map((u) => ({
        nodeId: u.nodeId,
        sourceText: u.sourceText,
        translatedText: `TRANSLATED(${u.sourceText})`,
      })),
    };
    const mergedIr = await pipeline.mergeChunk(extraction.ir, translated);

    // Save AFTER merging — this is the scenario that exposed the bug.
    const sessionAfterMerge = exportTranslationSession(
      { ...extraction, ir: mergedIr },
      chunks,
      CHUNK_CHAR_BUDGET,
    );

    // The snapshot itself must still be the PRISTINE, all-English HTML —
    // never the merged one — regardless of what's already been translated.
    expect(
      sessionAfterMerge.snapshot.parsoidHtml,
      "snapshot stays frozen at extraction time, unaffected by the merge that already happened",
    ).toBe(extraction.parsoidSnapshotHtml);
    expect(
      sessionAfterMerge.snapshot.parsoidHtml.includes("TRANSLATED"),
      "the reconstruction anchor must NOT contain the translated text",
    ).toBe(false);
    expect(
      sessionAfterMerge.chunks[0].translation.some(([, , text]) => text.startsWith("TRANSLATED(")),
      "the chunk's OWN translation tuples DO reflect the merge (live progress correctly updates)",
    ).toBe(true);

    // Reopen this saved session from scratch (as a brand new app session would) and confirm
    // progress is still computed correctly against the untouched snapshot — the article
    // being unreachable this time doesn't matter, since reopening never re-fetches it.
    (globalThis as any).fetch = mockFetch({ forbidHtmlFetch: true, wikidataUnreachable: true });
    const pipeline2 = (await import("@core/createPipeline")).createPipeline(
      (await import("@core/config/Config")).DEFAULT_CONFIG,
      new (await import("@core/logging/Logger")).ConsoleLogger(),
    );
    const result = await pipeline2.continueWithSavedSession(sessionAfterMerge);
    expect(result.progress.translated, "the already-translated chunk is correctly detected as translated").toBeGreaterThan(0);
  });

  it("exporting the same article twice produces identical chunk grouping and ids", async () => {
    const { session: session1 } = await exportFreshSession();
    const { session: session2 } = await exportFreshSession();

    const ids1 = session1.chunks.map((c) => [c.id, c.translation.map(([id]) => id)]);
    const ids2 = session2.chunks.map((c) => [c.id, c.translation.map(([id]) => id)]);

    expect(ids1).toEqual(ids2);
  });

  it("validation rejects malformed/incomplete sessions with a clear error", async () => {
    const { validateTranslationSession } = await import("@core/translationPackage/validate");
    const { PerseusError } = await import("@core/errors/PerseusError");

    const baseMeta = {
      articleTitle: "X",
      sourceLanguage: "en",
      targetWiki: "fa",
      exportedAt: "now",
      chunkCharBudget: 2500,
    };

    const cases: [string, unknown][] = [
      [
        "missing snapshot",
        {
          format: "perseus-package",
          formatVersion: 2,
          meta: baseMeta,
          provenance: { rawWikitext: "x" },
          chunks: [],
        },
      ],
      [
        "wrong format marker",
        {
          format: "some-other-format",
          formatVersion: 2,
          meta: baseMeta,
          snapshot: { parsoidHtml: "<p></p>" },
          provenance: { rawWikitext: "x" },
          chunks: [],
        },
      ],
      [
        "wrong format version",
        {
          format: "perseus-package",
          formatVersion: 99,
          meta: baseMeta,
          snapshot: { parsoidHtml: "<p></p>" },
          provenance: { rawWikitext: "x" },
          chunks: [],
        },
      ],
      [
        "unsupported target wiki",
        {
          format: "perseus-package",
          formatVersion: 2,
          meta: { ...baseMeta, targetWiki: "xx" },
          snapshot: { parsoidHtml: "<p></p>" },
          provenance: { rawWikitext: "x" },
          chunks: [],
        },
      ],
      [
        "tuple with wrong arity",
        {
          format: "perseus-package",
          formatVersion: 2,
          meta: baseMeta,
          snapshot: { parsoidHtml: "<p></p>" },
          provenance: { rawWikitext: "x" },
          chunks: [{ id: "chunk-1", translation: [[1, "p"]] }],
        },
      ],
    ];

    for (const [label, data] of cases) {
      let ok = false;
      try {
        validateTranslationSession(data);
      } catch (err) {
        ok = err instanceof PerseusError && err.category === "InputError";
      }
      expect(ok, `rejects: ${label}`).toBe(true);
    }
  });
});
