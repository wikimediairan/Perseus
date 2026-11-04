import "./../src/runtime/dom.js";

import {
  buildIRFromParsoidRoot,
  ConsoleLogger,
  SizeBoundedChunker,
  WikipediaExtractor,
} from "@perseus/core";
import { describe, expect, it, vi } from "vitest";
import type { TranslatedChunkRecord } from "../src/domain/types.js";
import { assemble } from "../src/perseus/flow.js";
import { parseHtml } from "../src/perseus/sections.js";

describe("assembly", () => {
  it("escapes raw ampersands in attributes before HTML-to-wikitext", async () => {
    const html = `<p>See <a rel="mw:ExtLink" href="https://example.test/?a=1&amp;b=2">the source</a> for details.</p>`;
    const document = parseHtml(html);
    const root = document.getElementById("perseus-root");
    if (!root) throw new Error("missing test root");

    const ir = buildIRFromParsoidRoot(
      root,
      "Test",
      undefined,
      "en.wikipedia.org",
    );
    const worklist = await new WikipediaExtractor().extract(ir);
    const chunks = await new SizeBoundedChunker().chunk(worklist);
    const chunk = chunks[0];
    if (!chunk) throw new Error("expected a chunk");

    const translation: TranslatedChunkRecord = {
      id: chunk.id,
      units: chunk.units.map((unit) => ({
        nodeId: unit.nodeId,
        sourceText: unit.sourceText,
        translatedText: unit.sourceText,
      })),
    };

    const fetchMock = vi.fn(
      async () => new Response("wikitext", { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      await assemble(
        ir,
        chunks,
        [translation],
        "fa",
        new ConsoleLogger(),
        false,
      );
    } finally {
      vi.unstubAllGlobals();
    }

    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(call[1].body)) as { html: string };
    expect(body.html).toContain("&amp;b=2");
    expect(body.html).not.toContain("?a=1&b=2");
  });

  it("does not mistake the Parsoid references list for a fourth inline ref", async () => {
    const html = `<p>Lead.<sup typeof="mw:Extension/ref" data-mw='{"name":"ref","attrs":{"name":"alpha&amp;beta"},"body":{"id":"mw-reference-text-alpha"}}'></sup> Reuse.<sup typeof="mw:Extension/ref" data-mw='{"name":"ref","attrs":{"name":"alpha&amp;beta"}}'></sup> Anonymous.<sup typeof="mw:Extension/ref" data-mw='{"name":"ref","attrs":{},"body":{"id":"mw-reference-text-beta"}}'></sup></p><div class="mw-references-wrap" typeof="mw:Extension/references"><span id="mw-reference-text-alpha">Alpha source</span><span id="mw-reference-text-beta">Beta source</span></div>`;
    const document = parseHtml(html);
    const root = document.getElementById("perseus-root");
    if (!root) throw new Error("missing test root");

    const ir = buildIRFromParsoidRoot(
      root,
      "Reference test",
      undefined,
      "en.wikipedia.org",
    );
    expect(ir.citations.allReferences()).toHaveLength(3);

    const worklist = await new WikipediaExtractor().extract(ir);
    const chunks = await new SizeBoundedChunker().chunk(worklist);
    const translations: TranslatedChunkRecord[] = chunks.map((chunk) => ({
      id: chunk.id,
      units: chunk.units.map((unit) => ({
        nodeId: unit.nodeId,
        sourceText: unit.sourceText,
        translatedText: unit.sourceText,
      })),
    }));

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            'Lead.<ref name="alpha&beta">Alpha source</ref> Reuse.<ref name="alpha&beta" /> Anonymous.<ref>Beta source</ref>\n\n== References ==\n<references />',
            { status: 200 },
          ),
      ),
    );

    try {
      await expect(
        assemble(ir, chunks, translations, "fa", new ConsoleLogger(), false),
      ).resolves.toContain('<ref name="alpha&beta" />');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("appends and then validates a Persian references list", async () => {
    const html = `<p>Lead.<sup typeof="mw:Extension/ref" data-mw='{"name":"ref","attrs":{},"body":{"id":"mw-reference-text-source"}}'></sup></p><div typeof="mw:Extension/references"><span id="mw-reference-text-source">Source</span></div>`;
    const document = parseHtml(html);
    const root = document.getElementById("perseus-root");
    if (!root) throw new Error("missing test root");
    const ir = buildIRFromParsoidRoot(
      root,
      "Reference fallback test",
      undefined,
      "en.wikipedia.org",
    );
    const worklist = await new WikipediaExtractor().extract(ir);
    const chunks = await new SizeBoundedChunker().chunk(worklist);
    const translations: TranslatedChunkRecord[] = chunks.map((chunk) => ({
      id: chunk.id,
      units: chunk.units.map((unit) => ({
        nodeId: unit.nodeId,
        sourceText: unit.sourceText,
        translatedText: unit.sourceText,
      })),
    }));

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response("Lead.<ref>Source</ref>", { status: 200 }),
      ),
    );

    try {
      await expect(
        assemble(ir, chunks, translations, "fa", new ConsoleLogger(), true),
      ).resolves.toContain("== منابع ==\n{{پانویس}}");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not append a duplicate when Persian wikitext already has {{پانویس}}", async () => {
    const html = `<p>Lead.<sup typeof="mw:Extension/ref" data-mw='{"name":"ref","attrs":{},"body":{"id":"mw-reference-text-source"}}'></sup></p><div typeof="mw:Extension/references"><span id="mw-reference-text-source">Source</span></div>`;
    const document = parseHtml(html);
    const root = document.getElementById("perseus-root");
    if (!root) throw new Error("missing test root");
    const ir = buildIRFromParsoidRoot(
      root,
      "Existing references test",
      undefined,
      "en.wikipedia.org",
    );
    const worklist = await new WikipediaExtractor().extract(ir);
    const chunks = await new SizeBoundedChunker().chunk(worklist);
    const translations: TranslatedChunkRecord[] = chunks.map((chunk) => ({
      id: chunk.id,
      units: chunk.units.map((unit) => ({
        nodeId: unit.nodeId,
        sourceText: unit.sourceText,
        translatedText: unit.sourceText,
      })),
    }));

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("Lead.<ref>Source</ref>\n\n== منابع ==\n{{پانویس}}", {
            status: 200,
          }),
      ),
    );

    try {
      const output = await assemble(
        ir,
        chunks,
        translations,
        "fa",
        new ConsoleLogger(),
        true,
      );
      expect(output.match(/\{\{پانویس\}\}/g)).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
