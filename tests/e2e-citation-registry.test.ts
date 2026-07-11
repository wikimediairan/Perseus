import "./helpers/setupDom";
import { refSup } from "./fixtures/citations";
import { jsonResponse, setGlobalFetch, textResponse, urlOf } from "./helpers/fetchMock";
import {
  isPageSourceRequest,
  isWikidataRequest,
  isWikitextToHtmlRequest,
} from "./helpers/mediawikiEndpoints";
import { loadPipelineModules, SUN_ARTICLE_REQUEST } from "./helpers/pipeline";

/**
 * Verifies Task 2 (build the CitationRegistry during parsing) in
 * isolation: the registry is populated correctly, and — just as
 * importantly — nothing about existing extraction/merge/generation
 * behavior changes as a result (the registry is not consumed anywhere
 * yet). Each scenario below is deliberately kept small and separate so
 * a failing assertion points at one specific behavior.
 */

async function runExtraction(html: string) {
  setGlobalFetch((input: RequestInfo | URL): Promise<Response> => {
    const url = urlOf(input);
    if (isPageSourceRequest(url))
      return Promise.resolve(jsonResponse({ title: "Sun", source: "x" }));
    if (isWikitextToHtmlRequest(url)) return Promise.resolve(textResponse(html));
    if (isWikidataRequest(url)) return Promise.resolve(jsonResponse({ entities: {} }));
    throw new Error("unexpected fetch: " + url);
  });

  const { createPipeline, DEFAULT_CONFIG, ConsoleLogger } = await loadPipelineModules();
  const pipeline = createPipeline(DEFAULT_CONFIG, new ConsoleLogger());
  return pipeline.runToExtraction(SUN_ARTICLE_REQUEST);
}

describe("CitationRegistry (E2E)", () => {
  it("a named reference defined once and reused once", async () => {
    const html =
      `<p>The Sun is a star.${refSup("cn-1", { name: "ref", attrs: { name: "smith2020" }, body: { html: "{{cite web}}-rendered" } })}` +
      ` It is very hot.${refSup("cn-2", { name: "ref", attrs: { name: "smith2020" } })}</p>`;

    const extraction = await runExtraction(html);
    const registry = extraction.ir.citations;
    const def = registry.allDefinitions().find((d) => d.name === "smith2020");
    const refs = registry.allReferences().filter((r) => r.name === "smith2020");

    expect(
      registry.allDefinitions().filter((d) => d.name === "smith2020").length,
      "exactly one definition for 'smith2020'",
    ).toBe(1);
    expect(
      def?.referencedBy.length,
      "definition referenced twice (defining occurrence + one reuse)",
    ).toBe(2);
    expect(refs.length, "two CitationReference entries for 'smith2020'").toBe(2);
    expect(
      refs.filter((r) => r.isDefining).length,
      "exactly one of them is the defining occurrence",
    ).toBe(1);
    expect(
      refs.every((r) => r.definitionId === def?.id),
      "both resolve to the same definitionId",
    ).toBe(true);
    expect(
      registry.warnings.some((w) => w.kind === "orphan-definition"),
      "no orphan-definition warning for a normal single-definition citation",
    ).toBe(false);
    expect(registry.warnings.length, "no other warnings raised for this clean case").toBe(0);
  });

  it("an anonymous (unnamed) citation", async () => {
    const html = `<p>A fact.${refSup("cn-3", { name: "ref", attrs: {}, body: { html: "Anonymous citation text" } })}</p>`;
    const extraction = await runExtraction(html);
    const registry = extraction.ir.citations;
    const def = registry.allDefinitions().find((d) => d.name === null);

    expect(!!def, "an anonymous definition (name=null) was captured").toBe(true);
    expect(def?.style, "style classified as plain-text (no recognized template)").toBe(
      "plain-text",
    );
    expect(
      def?.referencedBy.length,
      "it has exactly one reference (its own defining occurrence)",
    ).toBe(1);
  });

  it("a bare reference to a name with no definition anywhere", async () => {
    const html = `<p>Broken reference.${refSup("cn-4", { name: "ref", attrs: { name: "ghost" } })}</p>`;
    const extraction = await runExtraction(html);
    const registry = extraction.ir.citations;
    const ref = registry.allReferences().find((r) => r.name === "ghost");

    expect(ref?.definitionId, "reference is unresolved (definitionId null)").toBe(null);
    expect(
      registry.warnings.some((w) => w.kind === "missing-named-definition" && w.name === "ghost"),
      "a missing-named-definition warning was raised",
    ).toBe(true);
  });

  it("the same name defines a body twice", async () => {
    const html =
      `<p>First.${refSup("cn-5", { name: "ref", attrs: { name: "dup" }, body: { html: "First body" } })}</p>` +
      `<p>Second.${refSup("cn-6", { name: "ref", attrs: { name: "dup" }, body: { html: "Second body" } })}</p>`;

    const extraction = await runExtraction(html);
    const registry = extraction.ir.citations;
    const dupDefs = registry.allDefinitions().filter((d) => d.name === "dup");
    const dupRefs = registry.allReferences().filter((r) => r.name === "dup");

    expect(
      dupDefs.length,
      "only ONE definition object exists for 'dup' (first wins, second is not inserted)",
    ).toBe(1);
    expect(
      registry.warnings.some((w) => w.kind === "duplicate-definition" && w.name === "dup"),
      "a duplicate-definition warning was raised",
    ).toBe(true);
    expect(dupRefs.length, "both occurrences are tracked as references").toBe(2);
    expect(
      new Set(dupRefs.map((r) => r.definitionId)).size,
      "both references resolve to the SAME (first) definitionId — no dangling second definition",
    ).toBe(1);
    expect(
      dupDefs[0]?.referencedBy.length,
      "the single definition's referencedBy includes both occurrences",
    ).toBe(2);
  });

  it("malformed data-mw is preserved as an unresolved/unclassified entry, not dropped or thrown", async () => {
    const html = `<p>Weird ref.<sup typeof="mw:Extension/ref" data-mw="{not valid json" id="cn-7">[1]</sup></p>`;
    const extraction = await runExtraction(html);
    const registry = extraction.ir.citations;

    expect(
      registry.warnings.some((w) => w.kind === "malformed-reference"),
      "a malformed-reference warning was raised instead of throwing",
    ).toBe(true);
    expect(
      registry.allReferences().some((r) => r.element !== null),
      "the element handle was still captured (element is not null)",
    ).toBe(true);
  });

  it("building the registry does not change extraction output (nothing consumes it yet)", async () => {
    const html =
      `<p>The Sun is a star.${refSup("cn-1", { name: "ref", attrs: { name: "x" }, body: { html: "body" } })}</p>` +
      `<p>It is hot.</p>`;
    const extraction = await runExtraction(html);

    expect(extraction.ir.citations.allDefinitions().length, "registry was populated").toBe(1);
    expect(
      extraction.worklist.length,
      "both paragraphs are STILL extracted as ordinary text nodes — block selection is untouched by this task",
    ).toBe(2);
  });
});
