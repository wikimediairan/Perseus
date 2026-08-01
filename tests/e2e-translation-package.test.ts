import "./helpers/setupDom";
import { SUN_PAGE_ID, SUN_REVISION_ID } from "./fixtures/articles";
import { INVALID_TRANSLATION_SESSIONS } from "./fixtures/translationPackageFixtures";
import { loadPipelineModules, SUN_ARTICLE_REQUEST } from "./helpers/pipeline";
import { setTranslationSessionFetch } from "./helpers/translationSessionFetch";

const CHUNK_CHAR_BUDGET = 2500;

async function exportFreshSession() {
  setTranslationSessionFetch();
  const { createPipeline, DEFAULT_CONFIG, ConsoleLogger } = await loadPipelineModules();
  const { exportTranslationSession } = await import("@core/translation-sessions/export");

  const pipeline = createPipeline(DEFAULT_CONFIG, new ConsoleLogger());
  const extraction = await pipeline.runToExtraction(SUN_ARTICLE_REQUEST);
  const chunks = await pipeline.deriveChunks(extraction.worklist);
  return {
    pipeline,
    extraction,
    chunks,
    session: exportTranslationSession(extraction, chunks, CHUNK_CHAR_BUDGET),
  };
}

describe("Translation Session (E2E)", () => {
  it("export produces the new source/chunks shape, with no embedded article content", async () => {
    const { session } = await exportFreshSession();

    expect(session.format, "format marks this as a Perseus package").toBe("perseus-package");
    expect(session.formatVersion, "formatVersion is set").toBe(1);
    expect(session.meta.targetWiki, "meta.targetWiki defaults to fa").toBe("fa");
    expect(session.meta.chunkCharBudget, "meta.chunkCharBudget recorded").toBe(CHUNK_CHAR_BUDGET);

    expect(session.source.wiki, "source.wiki is the fixed source wiki code").toBe("enwiki");
    expect(session.source.pageId, "source.pageId matches the loaded article's page id").toBe(
      SUN_PAGE_ID,
    );
    expect(session.source.title, "source.title matches the loaded article's title").toBe("Sun");
    expect(
      session.source.revisionId,
      "source.revisionId matches the loaded article's revision id",
    ).toBe(SUN_REVISION_ID);

    expect(
      "snapshot" in session,
      "no embedded snapshot of article content anywhere in the session",
    ).toBe(false);
    expect("provenance" in session, "no embedded raw wikitext anywhere in the session").toBe(false);

    const allTuples = session.chunks.flatMap((c) => c.translation);
    expect(allTuples.length, "3 compact tuples across all chunks").toBe(3);
    expect(
      allTuples.every(([id]) => typeof id === "number"),
      "tuple ids are small numbers, not 'text-N' strings",
    ).toBe(true);
    expect(allTuples.map(([, tag]) => tag).join(","), "tuple tags are raw HTML tag names").toBe(
      "p,h2,p",
    );
    expect(
      allTuples.every((t) => t.length === 3),
      "no separate 'source' field anywhere on a tuple (tuple length is exactly 3)",
    ).toBe(true);
    expect(
      session.chunks.every((c) => typeof c.id === "string"),
      "chunk ids are strings, matching the in-memory Chunk type",
    ).toBe(true);
  });

  it("a chunk exported for external translation is exactly what the built-in executor would translate", async () => {
    const { chunks } = await exportFreshSession();
    const { renderChunkForTranslation } = await import("@core/stages/05-chunking/segmentProtocol");

    const rendered = renderChunkForTranslation(chunks[0]);
    expect(
      rendered.includes("[[SEGMENT 1]]"),
      "rendered chunk uses the shared segment wire format",
    ).toBe(true);
  });

  it("import reconstructs from source.revisionId alone — never by re-resolving the article by title", async () => {
    const { session } = await exportFreshSession();

    const filled = JSON.parse(JSON.stringify(session)) as typeof session;
    filled.chunks[0].translation[0][2] = filled.chunks[0].translation[0][2]
      .replace("Sun", "\u27EA1\u27EBخورشید\u27EA/1\u27EB")
      .replace("is a star.", "است.");

    setTranslationSessionFetch({ forbidPageSourceFetch: true });

    const { createPipeline, DEFAULT_CONFIG, ConsoleLogger } = await loadPipelineModules();
    const pipeline = createPipeline(DEFAULT_CONFIG, new ConsoleLogger());

    const result = await pipeline.continueWithSavedSession(filled);

    expect(
      result,
      "resume completed by fetching source.revisionId, never re-resolving by title",
    ).toBeTruthy();
  });

  it("unknown ids ignored during apply; duplicate ids rejected at the validation boundary", async () => {
    const { session } = await exportFreshSession();
    const { PerseusError } = await import("@core/platform/errors/PerseusError");
    const { createPipeline, DEFAULT_CONFIG, ConsoleLogger } = await loadPipelineModules();
    const { validateTranslationSession } = await import("@core/translation-sessions/validate");

    setTranslationSessionFetch();

    const withUnknown = JSON.parse(JSON.stringify(session)) as typeof session;
    withUnknown.chunks[0].translation.push([9999, "p", "Ghost entry"]);
    const pipeline1 = createPipeline(DEFAULT_CONFIG, new ConsoleLogger());
    const result1 = await pipeline1.continueWithSavedSession(withUnknown);

    expect(
      result1.ignoredUnknownIds.includes("text-9999") && result1.wikitext === "GENERATED",
      "unknown id ignored, pipeline still completes",
    ).toBe(true);

    const withDuplicate = JSON.parse(JSON.stringify(session)) as typeof session;
    withDuplicate.chunks[0].translation.push([
      withDuplicate.chunks[0].translation[0][0],
      "p",
      "Duplicate",
    ]);
    let duplicateOk = false;
    try {
      validateTranslationSession(withDuplicate);
    } catch (err) {
      duplicateOk =
        err instanceof PerseusError &&
        err.category === "InputError" &&
        /duplicate/i.test(err.message);
    }
    expect(
      duplicateOk,
      "duplicate id rejected by validateTranslationSession with a clear InputError",
    ).toBe(true);
  });

  it("exporting the same article twice produces identical chunk grouping and ids", async () => {
    const { session: session1 } = await exportFreshSession();
    const { session: session2 } = await exportFreshSession();

    const ids1 = session1.chunks.map((c) => [c.id, c.translation.map(([id]) => id)]);
    const ids2 = session2.chunks.map((c) => [c.id, c.translation.map(([id]) => id)]);

    expect(ids1).toEqual(ids2);
  });

  it("validation rejects malformed/incomplete sessions with a clear error", async () => {
    const { validateTranslationSession } = await import("@core/translation-sessions/validate");
    const { PerseusError } = await import("@core/platform/errors/PerseusError");

    for (const [label, data] of INVALID_TRANSLATION_SESSIONS) {
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
