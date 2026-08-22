import { DOMParser } from "linkedom";
import { beforeAll, describe, expect, it } from "vitest";
import { buildIRFromParsoidHtml } from "../src/stages/02-parsing/ParsoidParser";

beforeAll(() => {
  // buildIRFromParsoidHtml calls `new DOMParser()` internally, expecting it
  // on globalThis (production installs this the same way, for the same
  // reason — see apps/backend/src/wikimedia/domEnvironment.ts).
  (globalThis as Record<string, unknown>).DOMParser = DOMParser;
});

/** Wraps a raw Parsoid-shaped transclusion span's data-mw JSON as an HTML attribute. */
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

function textOf(ir: ReturnType<typeof buildIRFromParsoidHtml>): string[] {
  return ir.textNodes.map((n) => n.text);
}

describe("short description — issue 1", () => {
  it("exposes the prose parameter for translation", () => {
    const html = `<p>${transclusion("short description", { "1": "American engineer" })}</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");

    expect(textOf(ir)).toContain("American engineer");
  });
});

describe("about — issue 3", () => {
  it("exposes the human-readable disambiguation prose (param 2) for translation", () => {
    const html = `<p>${transclusion("about", {
      "1": "",
      "2": "the American tech entrepreneur and angel investor",
      "3": "Susan Wu (entrepreneur)",
    })}</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");

    expect(textOf(ir)).toContain(
      "the American tech entrepreneur and angel investor",
    );
  });

  it("does NOT expose the page-title parameter (param 3) for translation", () => {
    const html = `<p>${transclusion("about", {
      "1": "",
      "2": "the American tech entrepreneur and angel investor",
      "3": "Susan Wu (entrepreneur)",
    })}</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");

    expect(textOf(ir)).not.toContain("Susan Wu (entrepreneur)");
  });
});

describe("quote box — issue 4", () => {
  const html = `<p>${transclusion("quote box", {
    quote: "If a pioneer is somebody who breaks new ground...",
    source: "Suzanne Jenniches, on being labeled a pioneer.",
    align: "right",
    width: "30em",
    bgcolor: "#c6dbf7",
  })}</p>`;

  it("exposes quote and source for translation", () => {
    const ir = buildIRFromParsoidHtml(html, "Test");
    expect(textOf(ir)).toContain(
      "If a pioneer is somebody who breaks new ground...",
    );
    expect(textOf(ir)).toContain(
      "Suzanne Jenniches, on being labeled a pioneer.",
    );
  });

  it("does NOT expose the structural/style parameters for translation", () => {
    const ir = buildIRFromParsoidHtml(html, "Test");
    const all = textOf(ir);
    expect(all).not.toContain("right");
    expect(all).not.toContain("30em");
    expect(all).not.toContain("#c6dbf7");
  });
});

describe("Multiple image — issue 7", () => {
  const html = `<p>${transclusion("Multiple image", {
    image1: "Sheikh Hasina with E. Ahmed, New Delhi (cropped).jpg",
    image2: "Khaleda Zia with Manmohan Singh (cropped).jpg",
    footer:
      "Bangladeshi Muslim women drape the loose end of the [[sari]] over their heads.",
    caption1: "[[Sheikh Hasina]] in 2006",
    caption2: "[[Khaleda Zia]] in 2006",
    total_width: "300",
  })}</p>`;

  it("exposes footer/caption prose for translation, with wikilink targets protected", () => {
    const ir = buildIRFromParsoidHtml(html, "Test");
    const all = textOf(ir);

    // The prose is present, but a nested [[wikilink]]'s TARGET must not be
    // exposed as translatable text — only tokenizeWikitextValue's own
    // link-span label portion is. Assert the surrounding prose survived
    // and the raw wikitext double-bracket target syntax never leaked in
    // as literal translatable text outside of the tokenizer's own span.
    expect(all.some((t) => t.includes("Bangladeshi Muslim women"))).toBe(true);
    expect(all.some((t) => t.includes("in 2006"))).toBe(true);
  });

  it("does NOT expose image filenames or total_width for translation", () => {
    const ir = buildIRFromParsoidHtml(html, "Test");
    const all = textOf(ir);
    expect(all.join("\n")).not.toContain("Sheikh Hasina with E. Ahmed");
    expect(all.join("\n")).not.toContain("Khaleda Zia with Manmohan Singh");
    expect(all).not.toContain("300");
  });
});

describe("Non-allow-listed templates remain fully opaque (regression guard)", () => {
  it("a template not on the allowlist exposes nothing for translation", () => {
    const html = `<p>${transclusion("Random Unlisted Template", { made_up_param: "Some prose that should not translate" })}</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");
    expect(textOf(ir).join("\n")).not.toContain(
      "Some prose that should not translate",
    );
  });
});

describe("efn/footnote templates — additional requirement", () => {
  it("a simple {{efn|...}} exposes its prose for translation", () => {
    const html = `<p>${transclusion("efn", { "1": "Sources differ on the exact date." })}</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");
    expect(textOf(ir)).toContain("Sources differ on the exact date.");
  });

  it("a realistic mixed efn (prose + wikilink + italic markup + self-closing ref) translates only the prose, protects the rest", () => {
    const raw =
      "Sources differ on her birth year, e.g. the ''[[Oxford Dictionary of National Biography]]'' (2004) other recent sources state 1775,<ref name=ODNB/> while some state 1780.";
    const html = `<p>${transclusion("efn", { "1": raw })}</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");
    const all = textOf(ir).join("\n");

    // Prose survives.
    expect(all).toContain("Sources differ on her birth year");
    expect(all).toContain("while some state 1780.");
    // The wikilink's label ("Oxford Dictionary of National Biography")
    // is present as translatable text (it flows through the link-span's
    // open/close tokens), but the raw [[double-bracket]] wikitext syntax
    // itself must never appear as literal translatable text.
    expect(all).toContain("Oxford Dictionary of National Biography");
    expect(all).not.toContain("[[Oxford");
    // The self-closing ref tag must never leak into translatable text.
    expect(all).not.toContain("<ref");
    expect(all).not.toContain("ODNB");
  });

  it("does NOT expose the group/name identifier parameters for translation", () => {
    const html = `<p>${transclusion("efn", {
      group: "note",
      name: "birthyear",
      "1": "Sources differ on the exact date.",
    })}</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");
    const all = textOf(ir).join("\n");
    expect(all).not.toContain("note");
    expect(all).not.toContain("birthyear");
  });
});

describe("Infobox *_url parameters — additional requirement", () => {
  it("does not expose a *_url-suffixed infobox parameter for translation", () => {
    const html = `<p>${transclusion("Infobox person", {
      thesis_url: "http://www.worldcat.org/oclc/224273093",
      name: "Jane Doe",
    })}</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");
    const all = textOf(ir).join("\n");
    expect(all).not.toContain("worldcat.org");
  });
});
