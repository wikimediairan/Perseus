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
});
