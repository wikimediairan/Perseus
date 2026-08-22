import { DOMParser } from "linkedom";
import { beforeAll, describe, expect, it } from "vitest";
import type { TemplateLinkResolution } from "../src/ir/wikitextLinkUtils";
import { buildIRFromParsoidHtml } from "../src/stages/02-parsing/ParsoidParser";
import {
  reconstructWikitextValue,
  tokenizeWikitextValue,
} from "../src/stages/02-parsing/templateWikitextTokens";
import { assertDefined } from "./helpers/assertDefined";

beforeAll(() => {
  (globalThis as Record<string, unknown>).DOMParser = DOMParser;
});

/** Wraps a raw Parsoid-shaped transclusion span's data-mw JSON as an HTML attribute (same helper shape as templateParameters.test.ts). */
function transclusion(
  templateName: string,
  params: Record<string, string>,
): string {
  const dataMw = JSON.stringify({
    parts: [
      {
        template: {
          target: { wt: templateName, href: `./Template:${templateName}` },
          params: Object.fromEntries(
            Object.entries(params).map(([k, v]) => [k, { wt: v }]),
          ),
          i: 0,
        },
      },
    ],
  });
  return `<span typeof="mw:Transclusion" about="#mwt1" data-mw='${dataMw.replace(/'/g, "&#39;")}'></span>`;
}

describe("templateWikitextTokens — link target fragment stripping (Task 1 extension)", () => {
  it("strips a #Section fragment from a template-parameter wikilink target", () => {
    const { spans } = tokenizeWikitextValue(
      "[[Special relativity#History|the history]]",
      { onNestedTemplate: () => ({ id: 0, kind: "opaque", render: () => "" }) },
    );

    const linkSpan = spans.find((s) => s.kind === "link");
    expect(linkSpan?.target).toBe("Special relativity");
  });
});

describe("reconstructWikitextValue — interwiki-fallback link resolution (Task 2/4)", () => {
  it("with NO resolutions map at all: preserves original pre-existing behavior (backward compatibility)", () => {
    const { text, spans } = tokenizeWikitextValue("[[Some Article|a label]]", {
      onNestedTemplate: () => ({ id: 0, kind: "opaque", render: () => "" }),
    });

    const result = reconstructWikitextValue(text, spans);
    expect(result).toBe("[[Some Article|a label]]");
  });

  it("with an EMPTY resolutions map (no entry for this target): preserves original behavior", () => {
    const { text, spans } = tokenizeWikitextValue("[[Some Article|a label]]", {
      onNestedTemplate: () => ({ id: 0, kind: "opaque", render: () => "" }),
    });

    const result = reconstructWikitextValue(
      text,
      spans,
      new Map<string, TemplateLinkResolution>(),
    );
    expect(result).toBe("[[Some Article|a label]]");
  });

  it("resolved target: rewrites to the target-wiki title, piped form", () => {
    const { text, spans } = tokenizeWikitextValue(
      "[[Albert Einstein|Einstein]]",
      { onNestedTemplate: () => ({ id: 0, kind: "opaque", render: () => "" }) },
    );

    const resolutions = new Map<string, TemplateLinkResolution>([
      [
        "Albert Einstein",
        { resolvedTarget: "آلبرت اینشتین", fallbackTemplateName: null },
      ],
    ]);

    const result = reconstructWikitextValue(text, spans, resolutions);
    expect(result).toBe("[[آلبرت اینشتین|Einstein]]");
  });

  it("resolved target with label identical to the resolved title: bare form (no redundant pipe)", () => {
    const { text, spans } = tokenizeWikitextValue("[[Albert Einstein]]", {
      onNestedTemplate: () => ({ id: 0, kind: "opaque", render: () => "" }),
    });

    // Simulate the translator "translating" the label to exactly match
    // the resolved title.
    const translated = text.replace("Albert Einstein", "آلبرت اینشتین");

    const resolutions = new Map<string, TemplateLinkResolution>([
      [
        "Albert Einstein",
        { resolvedTarget: "آلبرت اینشتین", fallbackTemplateName: null },
      ],
    ]);

    const result = reconstructWikitextValue(translated, spans, resolutions);
    expect(result).toBe("[[آلبرت اینشتین]]");
  });

  it("no target-wiki equivalent + fallback template configured: renders {{<name>|label|target}}", () => {
    const { text, spans } = tokenizeWikitextValue(
      "[[Some Nonexistent Article|a translated label]]",
      { onNestedTemplate: () => ({ id: 0, kind: "opaque", render: () => "" }) },
    );

    const resolutions = new Map<string, TemplateLinkResolution>([
      [
        "Some Nonexistent Article",
        { resolvedTarget: null, fallbackTemplateName: "پم" },
      ],
    ]);

    const result = reconstructWikitextValue(text, spans, resolutions);
    expect(result).toBe("{{پم|a translated label|Some Nonexistent Article}}");
  });

  it("no target-wiki equivalent + NO fallback template configured: keeps the original, unresolved wikilink (Tajik-style backward compat)", () => {
    const { text, spans } = tokenizeWikitextValue(
      "[[Some Nonexistent Article|a label]]",
      { onNestedTemplate: () => ({ id: 0, kind: "opaque", render: () => "" }) },
    );

    const resolutions = new Map<string, TemplateLinkResolution>([
      [
        "Some Nonexistent Article",
        { resolvedTarget: null, fallbackTemplateName: null },
      ],
    ]);

    const result = reconstructWikitextValue(text, spans, resolutions);
    expect(result).toBe("[[Some Nonexistent Article|a label]]");
  });

  it("escapes a literal pipe and equals sign in the label when rendering an interwiki fallback call", () => {
    const { text, spans } = tokenizeWikitextValue(
      "[[Some Article|a label with a | pipe and an = sign]]",
      { onNestedTemplate: () => ({ id: 0, kind: "opaque", render: () => "" }) },
    );

    const resolutions = new Map<string, TemplateLinkResolution>([
      ["Some Article", { resolvedTarget: null, fallbackTemplateName: "پم" }],
    ]);

    const result = reconstructWikitextValue(text, spans, resolutions);
    expect(result).toBe(
      "{{پم|a label with a {{!}} pipe and an {{=}} sign|Some Article}}",
    );
  });

  it("degrades gracefully when the translation model dropped the link's tokens entirely", () => {
    const { spans } = tokenizeWikitextValue("[[Some Article|a label]]", {
      onNestedTemplate: () => ({ id: 0, kind: "opaque", render: () => "" }),
    });

    const resolutions = new Map<string, TemplateLinkResolution>([
      ["Some Article", { resolvedTarget: null, fallbackTemplateName: "پم" }],
    ]);

    // Tokens missing entirely from the "translated" text.
    const result = reconstructWikitextValue(
      "a label with no tokens at all",
      spans,
      resolutions,
    );
    expect(result).toBe("a label with no tokens at all");
  });
});

describe("End-to-end: Infobox field link resolution + interwiki fallback via the real extraction/merge path", () => {
  it("an Infobox field's wikilink is resolved to the target-wiki title once IRStructure.templateLinkResolutions is populated (simulating WikidataLinkResolver)", () => {
    const html = `<p>${transclusion("Infobox person", {
      known_for: "Known for work on [[General relativity]].",
    })}</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");

    // Confirm the target was collected for batching (Task 2).
    expect(ir.structure.templateLinkTargets).toContain("General relativity");

    // Simulate WikidataLinkResolver having run.
    ir.structure.templateLinkResolutions.set("General relativity", {
      resolvedTarget: "نسبیت عام",
      fallbackTemplateName: null,
    });

    const node = assertDefined(
      ir.textNodes.find((n) => n.text.includes("Known for")),
      "Expected a text node containing 'Known for'.",
    );

    // Simulate a translation leaving the link label untouched.
    const writer = assertDefined(
      ir.structure.templateParamWriters.get(node.id),
      `Expected a template-parameter writer for node ${node.id}.`,
    );
    writer(node.text);

    // Read back the transclusion's data-mw to confirm the wikitext value
    // now points at the resolved Persian title.
    const transclusionEl = [
      ...ir.structure.document.querySelectorAll('[typeof*="mw:Transclusion"]'),
    ][0];
    const dataMw = JSON.parse(transclusionEl.getAttribute("data-mw") ?? "{}");
    const value = dataMw.parts[0].template.params.known_for.wt as string;

    expect(value).toContain("[[نسبیت عام|General relativity]]");
  });

  it("an Infobox field's wikilink falls back to the interwiki template when no target-wiki equivalent exists", () => {
    const html = `<p>${transclusion("Infobox person", {
      known_for: "Known for [[Some Obscure Topic]].",
    })}</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");

    ir.structure.templateLinkResolutions.set("Some Obscure Topic", {
      resolvedTarget: null,
      fallbackTemplateName: "پم",
    });

    const node = assertDefined(
      ir.textNodes.find((n) => n.text.includes("Known for")),
      "Expected a text node containing 'Known for'.",
    );
    const writer = assertDefined(
      ir.structure.templateParamWriters.get(node.id),
      `Expected a template-parameter writer for node ${node.id}.`,
    );
    writer(node.text);

    const transclusionEl = [
      ...ir.structure.document.querySelectorAll('[typeof*="mw:Transclusion"]'),
    ][0];
    const dataMw = JSON.parse(transclusionEl.getAttribute("data-mw") ?? "{}");
    const value = dataMw.parts[0].template.params.known_for.wt as string;

    expect(value).toContain("{{پم|Some Obscure Topic|Some Obscure Topic}}");
  });
});
