import { DOMParser } from "linkedom";
import { describe, expect, it } from "vitest";
import type { ChunkPlan, TranslatedChunkRecord } from "../src/domain/types.js";
import {
  validateFinalWikitext,
  validateGeneratedStructure,
  validateTranslatedChunk,
} from "../src/perseus/validate.js";

const plan: ChunkPlan = {
  id: "chunk-1",
  fingerprint: "12345678",
  units: [
    {
      nodeId: "text-1",
      sourceText: "The ⟪1⟫Sun⟪/1⟫ is a ⟪*2⟫star.",
    },
    { nodeId: "text-2", sourceText: "Second paragraph." },
  ],
};

const firstSource = plan.units[0]?.sourceText ?? "";
const secondSource = plan.units[1]?.sourceText ?? "";

function translated(
  first = "خورشید ⟪1⟫ستاره⟪/1⟫ است. ⟪*2⟫",
  second = "پاراگراف دوم.",
): TranslatedChunkRecord {
  return {
    id: "chunk-1",
    units: [
      {
        nodeId: "text-1",
        sourceText: firstSource,
        translatedText: first,
      },
      {
        nodeId: "text-2",
        sourceText: secondSource,
        translatedText: second,
      },
    ],
  };
}

describe("validateTranslatedChunk", () => {
  it("accepts a translation that preserves every protected marker", () => {
    expect(validateTranslatedChunk(plan, translated()).units).toHaveLength(2);
  });

  it("accepts reordering different marker ids", () => {
    const result = translated("ابتدا ⟪*2⟫ سپس ⟪1⟫خورشید⟪/1⟫.");
    expect(validateTranslatedChunk(plan, result).units).toHaveLength(2);
  });

  it("rejects a dropped marker", () => {
    expect(() =>
      validateTranslatedChunk(plan, translated("خورشید ستاره است. ⟪*2⟫")),
    ).toThrow(/protected marker/);
  });

  it("rejects an extra marker", () => {
    expect(() =>
      validateTranslatedChunk(
        plan,
        translated("خورشید ⟪1⟫ستاره⟪/1⟫ ⟪9⟫است.⟪/9⟫ ⟪*2⟫"),
      ),
    ).toThrow(/protected marker/);
  });

  it("rejects an open/close inversion", () => {
    expect(() =>
      validateTranslatedChunk(plan, translated("خورشید ⟪/1⟫ستاره⟪1⟫ ⟪*2⟫")),
    ).toThrow(/open\/close order/);
  });

  it("rejects crossed protected spans even when marker counts match", () => {
    const nested: ChunkPlan = {
      id: "chunk-nested",
      fingerprint: "12345678",
      units: [
        {
          nodeId: "text-nested",
          sourceText: "⟪1⟫A ⟪2⟫B⟪/2⟫ C⟪/1⟫",
        },
      ],
    };
    expect(() =>
      validateTranslatedChunk(nested, {
        id: nested.id,
        units: [
          {
            nodeId: "text-nested",
            sourceText: nested.units[0]?.sourceText ?? "",
            translatedText: "⟪1⟫الف ⟪2⟫ب⟪/1⟫ پ⟪/2⟫",
          },
        ],
      }),
    ).toThrow(/crossed protected markers/);
  });

  it("rejects a missing unit", () => {
    const result = translated();
    result.units.pop();
    expect(() => validateTranslatedChunk(plan, result)).toThrow(/incomplete/);
  });

  it("rejects a changed source text", () => {
    const result = translated();
    const first = result.units[0];
    if (!first) throw new Error("Expected a first translated unit");
    first.sourceText = "different";
    expect(() => validateTranslatedChunk(plan, result)).toThrow(/source text/);
  });

  it("rejects a protocol leak", () => {
    expect(() =>
      validateTranslatedChunk(
        plan,
        translated("خورشید [[PERSEUS CHUNK chunk-1]] ⟪*2⟫"),
      ),
    ).toThrow(/protocol markers/);
  });
});

describe("validateFinalWikitext", () => {
  it("accepts normal wikitext", () => {
    expect(validateFinalWikitext("== تاریخ ==\nمتن")).toContain("متن");
  });

  it("rejects an internal marker", () => {
    expect(() => validateFinalWikitext("متن ⟪1⟫")).toThrow(/internal Perseus/);
  });

  it("rejects a protocol header", () => {
    expect(() => validateFinalWikitext("[[SEGMENT 1]]\nمتن")).toThrow(
      /protocol marker/,
    );
  });

  it("rejects wikitext that loses translated prose", () => {
    expect(() =>
      validateFinalWikitext("== منابع ==\n<references />", [
        {
          id: "chunk-1",
          units: [
            {
              nodeId: "text-1",
              sourceText: "Hello world.",
              translatedText: "سلام جهان",
            },
          ],
        },
      ]),
    ).toThrow(/omitted translated content/);
  });
});

describe("validateGeneratedStructure", () => {
  const root = new DOMParser()
    .parseFromString(
      `<div id="root"><p><a rel="mw:WikiLink" href="./Sun">Sun</a><sup typeof="mw:Extension/ref"></sup></p><table><tr><td>Cell</td></tr></table><span typeof="mw:Transclusion"></span></div>`,
      "text/html",
    )
    .getElementById("root") as unknown as Element;

  it("accepts wikitext with corresponding protected structures", () => {
    expect(() =>
      validateGeneratedStructure(
        root,
        "{{ترجمه با کمک مدل‌های بزرگ زبانی}}\n[[Sun]]<ref>Source</ref>\n{|\n| Cell\n|}\n{{Infobox}}",
        "fa",
      ),
    ).not.toThrow();
  });

  it.each([
    ["refs", "[[Sun]]\n{|\n| Cell\n|}\n{{Infobox}}"],
    ["tables", "[[Sun]]<ref>Source</ref>{{Infobox}}"],
    ["templates", "[[Sun]]<ref>Source</ref>\n{|\n| Cell\n|}"],
    ["links", "<ref>Source</ref>\n{|\n| Cell\n|}\n{{Infobox}}"],
  ])("rejects lost %s", (kind, body) => {
    expect(() =>
      validateGeneratedStructure(
        root,
        `{{ترجمه با کمک مدل‌های بزرگ زبانی}}\n${body}`,
        "fa",
      ),
    ).toThrow(`omitted ${kind}`);
  });

  it("rejects a substituted template even when the template count is unchanged", () => {
    const doc = new DOMParser().parseFromString(
      "<div id='root'><span typeof='mw:Transclusion'></span></div>",
      "text/html",
    );
    const template = doc.querySelector("span");
    if (!template) throw new Error("Missing fixture template");
    template.setAttribute(
      "data-mw",
      JSON.stringify({
        parts: [{ template: { target: { wt: "Infobox person" } } }],
      }),
    );
    const templateRoot = doc.getElementById("root") as unknown as Element;
    expect(() =>
      validateGeneratedStructure(
        templateRoot,
        "{{ترجمه با کمک مدل‌های بزرگ زبانی}}\n{{Wrong template}}",
        "fa",
      ),
    ).toThrow(/protected template/);
  });

  it("does not count a Parsoid references-list extension as a ref", () => {
    const doc = new DOMParser().parseFromString(
      `<div id="root"><div class="mw-references-wrap" typeof="mw:Extension/references"></div></div>`,
      "text/html",
    );
    const referencesRoot = doc.getElementById("root") as unknown as Element;

    expect(() =>
      validateGeneratedStructure(
        referencesRoot,
        "{{ترجمه با کمک مدل‌های بزرگ زبانی}}\n<references />",
        "fa",
      ),
    ).not.toThrow();
    expect(() =>
      validateGeneratedStructure(
        referencesRoot,
        "{{ترجمه با کمک مدل‌های بزرگ زبانی}}",
        "fa",
      ),
    ).toThrow(/references list/);
  });

  it("accepts the supported Persian references-list template", () => {
    const doc = new DOMParser().parseFromString(
      `<div id="root"><div typeof="mw:Extension/references"></div></div>`,
      "text/html",
    );
    const referencesRoot = doc.getElementById("root") as unknown as Element;

    expect(() =>
      validateGeneratedStructure(
        referencesRoot,
        "{{ترجمه با کمک مدل‌های بزرگ زبانی}}\n{{ پانویس | چپ‌چین = بله }}",
        "fa",
      ),
    ).not.toThrow();
  });

  it("requires a list when section selection requested a fallback", () => {
    const doc = new DOMParser().parseFromString(
      `<div id="root"><sup typeof="mw:Extension/ref" data-mw='{"name":"ref","attrs":{},"body":{"html":"Source"}}'></sup></div>`,
      "text/html",
    );
    const referencesRoot = doc.getElementById("root") as unknown as Element;

    expect(() =>
      validateGeneratedStructure(
        referencesRoot,
        "{{ترجمه با کمک مدل‌های بزرگ زبانی}}\n<ref>Source</ref>",
        "fa",
        true,
      ),
    ).toThrow(/references list/);
  });

  it("accepts named definitions, self-closing usages, and anonymous refs without counting the references list", () => {
    const doc = new DOMParser().parseFromString(
      `<div id="root">
        <sup typeof="mw:Extension/ref" data-mw='{"name":"ref","attrs":{"name":"alpha"},"body":{"id":"mw-reference-text-alpha"}}'></sup>
        <sup typeof="mw:Extension/ref" data-mw='{"attrs":{"name":"alpha"}}'></sup>
        <sup typeof="mw:Extension/ref" data-mw='{"name":"ref","attrs":{},"body":{"id":"mw-reference-text-beta"}}'></sup>
        <div typeof="mw:Extension/references"><span id="mw-reference-text-alpha">Alpha source</span><span id="mw-reference-text-beta">Beta source</span></div>
      </div>`,
      "text/html",
    );
    const referencesRoot = doc.getElementById("root") as unknown as Element;
    const disclosure = "{{ترجمه با کمک مدل‌های بزرگ زبانی}}\n";

    expect(() =>
      validateGeneratedStructure(
        referencesRoot,
        `${disclosure}<ref name="alpha">Alpha source</ref><ref name="alpha" /><ref>Beta source</ref><references />`,
        "fa",
      ),
    ).not.toThrow();

    expect(() =>
      validateGeneratedStructure(
        referencesRoot,
        `${disclosure}<ref name="alpha" /><ref name="alpha" /><ref>Beta source</ref><references />`,
        "fa",
      ),
    ).toThrow(/omitted refs/);

    expect(() =>
      validateGeneratedStructure(
        referencesRoot,
        `${disclosure}<ref name="alpha">Alpha source</ref><ref name="alpha">Duplicate definition</ref><ref>Beta source</ref><references />`,
        "fa",
      ),
    ).toThrow(/omitted refs/);
  });

  it("rejects malformed refs instead of accepting their opening tags", () => {
    const doc = new DOMParser().parseFromString(
      `<div id="root"><sup typeof="mw:Extension/ref" data-mw='{"name":"ref","attrs":{},"body":{"id":"mw-reference-text-source"}}'></sup><div typeof="mw:Extension/references"><span id="mw-reference-text-source">Source</span></div></div>`,
      "text/html",
    );
    const referencesRoot = doc.getElementById("root") as unknown as Element;

    expect(() =>
      validateGeneratedStructure(
        referencesRoot,
        "{{ترجمه با کمک مدل‌های بزرگ زبانی}}\n<ref>Source",
        "fa",
      ),
    ).toThrow(/malformed refs/);
  });

  it("validates a reference-list template separately from inline refs", () => {
    const doc = new DOMParser().parseFromString(
      `<div id="root"><span typeof="mw:Transclusion" data-mw='{"parts":[{"template":{"target":{"wt":"پانویس"}}}]}'></span></div>`,
      "text/html",
    );
    const referencesRoot = doc.getElementById("root") as unknown as Element;

    expect(() =>
      validateGeneratedStructure(
        referencesRoot,
        "{{ترجمه با کمک مدل‌های بزرگ زبانی}}\n{{پانویس}}",
        "fa",
      ),
    ).not.toThrow();
    expect(() =>
      validateGeneratedStructure(
        referencesRoot,
        "{{ترجمه با کمک مدل‌های بزرگ زبانی}}\n<references />",
        "fa",
      ),
    ).toThrow(/templates/);
  });
});
