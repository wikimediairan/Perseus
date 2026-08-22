import { DOMParser } from "linkedom";
import { beforeAll, describe, expect, it } from "vitest";
import { buildIRFromParsoidHtml } from "../src/stages/02-parsing/ParsoidParser";
import { assertDefined } from "./helpers/assertDefined";

beforeAll(() => {
  (globalThis as Record<string, unknown>).DOMParser = DOMParser;
});

/** Builds a Parsoid-shaped transclusion element's outerHTML, matching the shape templateParameters.ts/templateParameters.test.ts already expect. */
function transclusion(
  tag: string,
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
  return `<${tag} typeof="mw:Transclusion" about="#mwt1" data-mw='${dataMw.replace(/'/g, "&#39;")}'></${tag}>`;
}

function textOf(ir: ReturnType<typeof buildIRFromParsoidHtml>): string {
  return ir.textNodes.map((n) => n.text).join("\n");
}

/** Reads back a transclusion element's parsed data-mw, for structure-preservation assertions. */
function readDataMw(el: Element): {
  parts: [
    {
      template: {
        target: { wt: string };
        params: Record<string, { wt: string }>;
      };
    },
  ];
} {
  return JSON.parse(el.getAttribute("data-mw") ?? "{}");
}

/** Finds the (single) transclusion element these fixtures each produce. */
function findTransclusion(
  ir: ReturnType<typeof buildIRFromParsoidHtml>,
): Element {
  return assertDefined(
    ir.structure.document.querySelector('[typeof*="mw:Transclusion"]'),
    "Expected the fixture to contain one mw:Transclusion element.",
  );
}

/** Simulates Merge calling a template-parameter node's writer with translated text. */
function writeTranslatedText(
  ir: ReturnType<typeof buildIRFromParsoidHtml>,
  node: { id: string; text: string },
  translatedText: string,
): void {
  const writer = assertDefined(
    ir.structure.templateParamWriters.get(node.id),
    `Expected a template-parameter writer for node ${node.id}.`,
  );
  writer(translatedText);
}

describe("Requirement 1 — HTML comments never enter translation", () => {
  it("a comment embedded inside a translatable template parameter (the reported bug) is excluded from translation", () => {
    const html = `<p>${transclusion("table", "Infobox", {
      owners: "Some Value <!-- or | owners = -->",
    })}</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");

    expect(textOf(ir)).toContain("Some Value");
    expect(textOf(ir)).not.toContain("or | owners =");
  });

  it("the exact reported examples are excluded from translation", () => {
    const html = `<p>${transclusion("table", "Infobox officeholder", {
      order: "General Secretary <!-- or | owners = -->",
      title: "General Secretary <!-- or | gen_sec for General Secretary -->",
    })}</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");

    expect(textOf(ir)).not.toContain("or | owners =");
    expect(textOf(ir)).not.toContain("or | gen_sec for General Secretary");
  });

  it("prose surrounding a template-parameter comment still translates normally (the comment is excised, not the whole value)", () => {
    const html = `<p>${transclusion("table", "Infobox", {
      caption: "Before comment <!-- editorial note --> after comment",
    })}</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");

    expect(textOf(ir)).toContain("Before comment");
    expect(textOf(ir)).toContain("after comment");
    expect(textOf(ir)).not.toContain("editorial note");
  });

  it("a comment is preserved VERBATIM in the reconstructed wikitext value, not deleted (consistent with placeholders.ts's existing DOM-comment behavior)", () => {
    const html = `<p>${transclusion("table", "Infobox", {
      owners: "Some Value <!-- or | owners = -->",
    })}</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");

    const node = ir.textNodes[0];
    // Simulate translation leaving the comment's token untouched (as instructed).
    writeTranslatedText(ir, node, node.text);

    const el = findTransclusion(ir);
    const dataMw = readDataMw(el);
    expect(dataMw.parts[0].template.params.owners.wt).toContain(
      "<!-- or | owners = -->",
    );
  });

  it("multiple comments in the same parameter value are all excluded and all preserved on reconstruction", () => {
    const html = `<p>${transclusion("table", "Infobox", {
      note: "<!--first--> A <!--second--> B <!--third-->",
    })}</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");

    expect(textOf(ir)).not.toContain("first");
    expect(textOf(ir)).not.toContain("second");
    expect(textOf(ir)).not.toContain("third");
    expect(textOf(ir)).toContain("A");
    expect(textOf(ir)).toContain("B");

    const node = ir.textNodes[0];
    writeTranslatedText(ir, node, node.text);

    const el = findTransclusion(ir);
    const value = readDataMw(el).parts[0].template.params.note.wt;
    expect(value).toContain("<!--first-->");
    expect(value).toContain("<!--second-->");
    expect(value).toContain("<!--third-->");
  });

  it("a comment containing wikitext-looking content ({{ or [[) is treated as fully opaque, not further tokenized", () => {
    const html = `<p>${transclusion("table", "Infobox", {
      note: "See <!-- {{cite web}} was here, now [[Foo|bar]] --> the source.",
    })}</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");

    expect(textOf(ir)).not.toContain("cite web");
    expect(textOf(ir)).not.toContain("Foo");
    expect(textOf(ir)).toContain("See");
    expect(textOf(ir)).toContain("the source.");

    // No link target should have been collected from inside the comment.
    expect(ir.structure.templateLinkTargets).not.toContain("Foo");
  });

  it("an unterminated comment (no closing -->) degrades gracefully instead of swallowing the rest of the value", () => {
    const html = `<p>${transclusion("table", "Infobox", {
      note: "Some text <!-- unterminated comment",
    })}</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");

    // Falls through to plain text char-by-char (same degradation as an
    // unmatched {{ / [[ / <ref — see tokenizeWikitextValue).
    expect(textOf(ir)).toContain("Some text");
  });

  it("ordinary DOM-level comments (outside any template) remain unaffected by this fix (regression guard, existing behavior)", () => {
    const html = `<p>Some prose.<!-- internal note --> More prose.</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");

    expect(ir.textNodes[0].text).toContain("Some prose.");
    expect(ir.textNodes[0].text).toContain("More prose.");
    expect(ir.textNodes[0].text).not.toContain("internal note");
  });
});

describe("Requirement 2 — Blockquote content is translatable", () => {
  it("named parameters (text=, author=) both become translation segments", () => {
    const html = `<p>${transclusion("blockquote", "Blockquote", {
      text: "Some English quotation here",
      author: "Author Name",
    })}</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");

    expect(textOf(ir)).toContain("Some English quotation here");
    expect(textOf(ir)).toContain("Author Name");
  });

  it("positional form ({{Blockquote|Some quotation}}) becomes a translation segment", () => {
    const html = `<p>${transclusion("blockquote", "Blockquote", {
      "1": "Some English quotation here",
    })}</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");

    expect(textOf(ir)).toContain("Some English quotation here");
  });

  it("template STRUCTURE (name, parameter keys) survives merge unchanged -- only the wt VALUES change", () => {
    const html = `<p>${transclusion("blockquote", "Blockquote", {
      text: "Some English quotation here",
      author: "Author Name",
    })}</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");

    for (const node of ir.textNodes) {
      writeTranslatedText(ir, node, node.text.replace("English", "TRANSLATED"));
    }

    const el = findTransclusion(ir);
    const dataMw = readDataMw(el);

    expect(dataMw.parts[0].template.target.wt).toBe("Blockquote");
    expect(Object.keys(dataMw.parts[0].template.params).sort()).toEqual([
      "author",
      "text",
    ]);
    expect(dataMw.parts[0].template.params.text.wt).toContain("TRANSLATED");
  });
});

describe("Requirement 3 — Efn content is translatable", () => {
  it("positional form ({{efn|note}}) becomes a translation segment", () => {
    const html = `<p>${transclusion("span", "efn", {
      "1": "Some English explanatory note",
    })}</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");

    expect(textOf(ir)).toContain("Some English explanatory note");
  });

  it("named form ({{efn|text=note}}) becomes a translation segment", () => {
    const html = `<p>${transclusion("span", "efn", {
      text: "Some English explanatory note",
    })}</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");

    expect(textOf(ir)).toContain("Some English explanatory note");
  });

  it("the name= parameter (cross-reference identifier) is NOT translated -- structural, not prose", () => {
    const html = `<p>${transclusion("span", "efn", {
      name: "footnote-a",
      text: "Some English explanatory note",
    })}</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");

    expect(textOf(ir)).not.toContain("footnote-a");
    expect(textOf(ir)).toContain("Some English explanatory note");
  });

  it("efn template structure (name, parameter keys) survives merge unchanged", () => {
    const html = `<p>${transclusion("span", "efn", {
      text: "Some English explanatory note",
    })}</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");

    const node = ir.textNodes[0];
    writeTranslatedText(ir, node, node.text.replace("English", "TRANSLATED"));

    const el = findTransclusion(ir);
    const dataMw = readDataMw(el);

    expect(dataMw.parts[0].template.target.wt).toBe("efn");
    expect(Object.keys(dataMw.parts[0].template.params)).toEqual(["text"]);
    expect(dataMw.parts[0].template.params.text.wt).toContain("TRANSLATED");
  });
});

describe("Requirement — existing protected-template behavior does not regress", () => {
  it("a template NOT on the allowlist stays fully opaque -- none of its parameters become TextNodes", () => {
    const html = `<p>${transclusion("span", "Cite web", {
      title: "Some English Article Title",
      url: "https://example.com",
    })}</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");

    expect(ir.textNodes).toHaveLength(0);
  });

  it("a protected parameter (url) inside an ALLOWED template still stays non-translatable", () => {
    const html = `<p>${transclusion("table", "Infobox", {
      caption: "A human-readable caption",
      website: "https://example.com",
    })}</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");

    expect(textOf(ir)).toContain("A human-readable caption");
    expect(textOf(ir)).not.toContain("example.com");
  });

  it("a nested, non-recursable template inside an allowed template's parameter stays a single opaque unit", () => {
    const html = `<p>${transclusion("table", "Infobox", {
      birth_date: "Born {{birth date|1815|12|10}} in London",
    })}</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");

    expect(textOf(ir)).toContain("Born");
    expect(textOf(ir)).toContain("in London");
    expect(textOf(ir)).not.toContain("birth date");
    expect(textOf(ir)).not.toContain("1815");
  });
});
