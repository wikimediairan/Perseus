import "./helpers/setupDom";
import { refSup } from "./fixtures/citations";
import { createCitationPipelineFetch } from "./helpers/citationPipelineFetch";
import { setGlobalFetch } from "./helpers/fetchMock";
import { createCapturingLogger } from "./helpers/logger";
import { createOllamaPipeline, SUN_ARTICLE_REQUEST } from "./helpers/pipeline";

/**
 * Verifies the actual bug fix: citations surviving translation and
 * merge, deterministically, with the CitationRegistry as the sole
 * source of truth for reconstruction (never a live HTML read). This is
 * the scenario from the original bug report: named refs, repeated refs,
 * reference order, and definitions inside a rendered reference list.
 */

async function runFullPipeline(html: string) {
  const { handler, getCapturedHtml } = createCitationPipelineFetch(html);
  setGlobalFetch(handler);
  const { logger, warnings: logLines } = createCapturingLogger();
  const pipeline = await createOllamaPipeline(logger);
  const result = await pipeline.run(SUN_ARTICLE_REQUEST);
  return { result, logLines, getCapturedHtml };
}

describe("Citation Preservation (E2E)", () => {
  it("a named reference defined inline in a translated paragraph survives merge verbatim", async () => {
    const html =
      `<p>The Sun is a star.${refSup("cn-1", { name: "ref", attrs: { name: "smith2020" }, body: { html: "cite web rendered" } })}` +
      ` It is very hot.${refSup("cn-2", { name: "ref", attrs: { name: "smith2020" } })}</p>`;

    const { handler, getCapturedHtml } = createCitationPipelineFetch(html);
    setGlobalFetch(handler);
    const pipeline = await createOllamaPipeline();

    // Capture what the DOM itself considers each marker's canonical serialized form (its own
    // snapshot, taken at parse time) — comparing against a hand-typed literal would be comparing
    // against the wrong thing, since DOM serializers normalize attribute quoting on output.
    const extraction = await pipeline.runToExtraction(SUN_ARTICLE_REQUEST);
    const refs = extraction.ir.citations.allReferences();
    const definingSnapshot = refs.find((r) => r.isDefining)?.snapshotHtml;
    const reuseSnapshot = refs.find((r) => !r.isDefining)?.snapshotHtml;

    const result = await pipeline.continueWithBuiltInTranslation(extraction);
    const capturedGeneratorHtml = getCapturedHtml();

    expect(result.wikitext, "pipeline completed and produced wikitext").toBe("GENERATED");
    expect(
      capturedGeneratorHtml.includes("TR:"),
      "translated text made it into the reconstructed HTML",
    ).toBe(true);
    expect(
      !!definingSnapshot && capturedGeneratorHtml.includes(definingSnapshot),
      "the defining citation marker's exact snapshot HTML survived, unmodified",
    ).toBe(true);
    expect(
      !!reuseSnapshot && capturedGeneratorHtml.includes(reuseSnapshot),
      "the reused citation marker's exact snapshot HTML also survived",
    ).toBe(true);
    expect(
      capturedGeneratorHtml.includes("smith2020"),
      "the defining marker's data-mw (name=smith2020) is intact",
    ).toBe(true);
  });

  it("reference order is preserved across a translated paragraph", async () => {
    const html =
      `<p>First claim${refSup("cn-a", { name: "ref", attrs: { name: "alpha" }, body: { html: "Alpha source" } }, "[1]")} then ` +
      `second claim${refSup("cn-b", { name: "ref", attrs: { name: "beta" }, body: { html: "Beta source" } }, "[2]")}.</p>`;

    const { result, getCapturedHtml } = await runFullPipeline(html);
    const capturedGeneratorHtml = getCapturedHtml();

    const alphaPos = capturedGeneratorHtml.indexOf('id="cn-a"');
    const betaPos = capturedGeneratorHtml.indexOf('id="cn-b"');

    expect(result.wikitext, "pipeline completed").toBe("GENERATED");
    expect(alphaPos !== -1 && betaPos !== -1, "both markers present").toBe(true);
    expect(alphaPos < betaPos, "alpha still appears before beta, matching source order").toBe(true);
  });

  it("a citation's rendered <li> entry in the references list is never translated/mangled", async () => {
    const originalLi =
      '<li about="#cite_note-1" id="cite_note-1"><span class="mw-reference-text">Smith, J. (2020). <i>Example Title</i>. Publisher.</span></li>';
    const html =
      `<p>A fact.${refSup("cn-1", { name: "ref", attrs: { name: "x" }, body: { html: "body" } })}</p>` +
      `<ol class="mw-references" typeof="mw:Extension/references">${originalLi}</ol>`;

    const { result, getCapturedHtml } = await runFullPipeline(html);
    const capturedGeneratorHtml = getCapturedHtml();

    expect(result.wikitext, "pipeline completed").toBe("GENERATED");
    expect(
      capturedGeneratorHtml.includes(originalLi),
      "the references list <li> content is byte-for-byte unchanged (never sent to the LLM)",
    ).toBe(true);
    expect(
      !capturedGeneratorHtml.includes("TR:Smith"),
      "it was NOT prefixed with the mock translator's 'TR:' marker",
    ).toBe(true);
  });

  it("a broken article (missing named definition) logs a warning but still completes deterministically", async () => {
    const html = `<p>Broken.${refSup("cn-1", { name: "ref", attrs: { name: "ghost" } })}</p>`;
    const { result, logLines } = await runFullPipeline(html);

    expect(result.wikitext, "pipeline still completed rather than throwing").toBe("GENERATED");
    expect(
      logLines.some((l) => l.includes('"ghost"') && l.includes("no matching definition")),
      "a warning about the missing definition was logged",
    ).toBe(true);
  });

  it("if the live DOM disagrees with the registry snapshot, the registry wins and a warning is logged", async () => {
    const html = `<p>The Sun is a star.${refSup("cn-1", { name: "ref", attrs: { name: "x" }, body: { html: "body" } })}</p>`;
    const { handler, getCapturedHtml } = createCitationPipelineFetch(html);
    setGlobalFetch(handler);

    const { logger, warnings: logLines } = createCapturingLogger();
    const pipeline = await createOllamaPipeline(logger);
    const extraction = await pipeline.runToExtraction(SUN_ARTICLE_REQUEST);

    // Simulate unexpected drift: something mutates the live citation element after parsing.
    const citationRef = extraction.ir.citations.allReferences()[0];
    const beforeSnapshot = citationRef.snapshotHtml;
    citationRef.element?.setAttribute("data-mw", '{"tampered":true}');

    const result = await pipeline.continueWithBuiltInTranslation(extraction);
    const capturedGeneratorHtml = getCapturedHtml();

    expect(result.wikitext, "pipeline still completed").toBe("GENERATED");
    expect(
      logLines.some((l) => l.includes("no longer matches the registry's snapshot")),
      "an html-drift warning was logged",
    ).toBe(true);
    expect(
      capturedGeneratorHtml.includes(beforeSnapshot),
      "the ORIGINAL snapshot (not the tampered live DOM) made it into the generated HTML",
    ).toBe(true);
    expect(
      !capturedGeneratorHtml.includes("tampered"),
      "the tampered attribute did NOT make it into the generated HTML",
    ).toBe(true);
  });
});
