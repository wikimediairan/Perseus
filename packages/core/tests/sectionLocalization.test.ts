import { DOMParser } from "linkedom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type {
  SectionLocalizationConfig,
  TargetWikiDefinition,
} from "../src/config/targetWikis";
import { buildIRFromParsoidHtml } from "../src/stages/02-parsing/ParsoidParser";
import { localizeReferenceSections } from "../src/stages/09-generation/sectionLocalization";
import { WikipediaWikitextGenerator } from "../src/stages/09-generation/WikitextGenerator";
import { assertDefined } from "./helpers/assertDefined";

beforeAll(() => {
  (globalThis as Record<string, unknown>).DOMParser = DOMParser;
});

const FA_SECTION_LOCALIZATION: SectionLocalizationConfig = {
  notesHeading: "پانویس",
  referencesHeading: "منابع",
  reflistTemplateName: "پانویس",
  referencesTemplateParams: { چپ‌چین: "بله" },
};

const FA_TARGET_WIKI: TargetWikiDefinition = {
  code: "fa",
  displayName: "Persian Wikipedia",
  languageName: "Persian",
  domain: "fa.wikipedia.org",
  create: "",
  draft: "",
  move: "",
  direction: "rtl",
  templateRemovalDenylist: [],
  interwikiFallbackTemplate: null,
  translationDisclosureTemplate: null,
  sectionLocalization: FA_SECTION_LOCALIZATION,
};

const TJ_TARGET_WIKI: TargetWikiDefinition = {
  ...FA_TARGET_WIKI,
  code: "tj",
  displayName: "Tajik Wikipedia",
  sectionLocalization: null,
};

/** Builds a live #perseus-root Element from Parsoid-shaped fixture HTML, same as the parser would produce. */
function buildRoot(html: string): Element {
  const ir = buildIRFromParsoidHtml(html, "Test");
  return assertDefined(
    ir.structure.document.getElementById("perseus-root"),
    "Expected the fixture document to have a #perseus-root element.",
  );
}

function reflistDataMw(templateName: string, params: string): string {
  const dataMw = JSON.stringify({
    parts: [
      {
        template: {
          target: { wt: templateName, href: `./Template:${templateName}` },
          params: params ? JSON.parse(params) : {},
          i: 0,
        },
      },
    ],
  });
  return dataMw.replace(/'/g, "&#39;");
}

function transclusion(templateName: string, paramsJson = "{}"): string {
  return `<span typeof="mw:Transclusion" data-mw='${reflistDataMw(templateName, paramsJson)}'></span>`;
}

function readTemplate(root: Element): {
  name: string;
  params: Record<string, string>;
} {
  const el = assertDefined(
    root.querySelector('[typeof="mw:Transclusion"]'),
    "Expected a reflist transclusion element to still be present.",
  );
  const dataMw = JSON.parse(el.getAttribute("data-mw") ?? "{}");
  const template = dataMw.parts[0].template;
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(
    template.params as Record<string, { wt: string }>,
  )) {
    params[key] = value.wt;
  }
  return { name: template.target.wt, params };
}

describe("localizeReferenceSections", () => {
  it("localizes a plain Notes section: heading text and bare {{reflist}}", () => {
    const root = buildRoot(`<h2>Notes</h2>${transclusion("reflist")}`);

    const count = localizeReferenceSections(root, FA_SECTION_LOCALIZATION);

    expect(count).toBe(1);
    expect(root.querySelector("h2")?.textContent).toBe("پانویس");
    expect(readTemplate(root)).toEqual({ name: "پانویس", params: {} });
  });

  it("preserves existing parameters exactly when localizing a Notes section's reflist", () => {
    const root = buildRoot(
      `<h2>Notes</h2>${transclusion("reflist", '{"1":{"wt":"30em"}}')}`,
    );

    localizeReferenceSections(root, FA_SECTION_LOCALIZATION);

    expect(readTemplate(root)).toEqual({
      name: "پانویس",
      params: { "1": "30em" },
    });
  });

  it("localizes a References section: heading text, template rename, and left-align param injected", () => {
    const root = buildRoot(`<h2>References</h2>${transclusion("Reflist")}`);

    const count = localizeReferenceSections(root, FA_SECTION_LOCALIZATION);

    expect(count).toBe(1);
    expect(root.querySelector("h2")?.textContent).toBe("منابع");
    expect(readTemplate(root)).toEqual({
      name: "پانویس",
      params: { چپ‌چین: "بله" },
    });
  });

  it("merges the left-align param onto a References reflist without dropping its existing params", () => {
    const root = buildRoot(
      `<h2>References</h2>${transclusion("Reflist", '{"group":{"wt":"foo"}}')}`,
    );

    localizeReferenceSections(root, FA_SECTION_LOCALIZATION);

    expect(readTemplate(root)).toEqual({
      name: "پانویس",
      params: { group: "foo", چپ‌چین: "بله" },
    });
  });

  it("matches Reflist case-insensitively via the existing template-name normalizer", () => {
    const root = buildRoot(`<h2>Notes</h2>${transclusion("REFLIST")}`);

    localizeReferenceSections(root, FA_SECTION_LOCALIZATION);

    expect(readTemplate(root).name).toBe("پانویس");
  });

  it("is a no-op when there is no sectionLocalization config for the target wiki (e.g. tj)", () => {
    const root = buildRoot(`<h2>Notes</h2>${transclusion("reflist")}`);

    const count = localizeReferenceSections(root, null);

    expect(count).toBe(0);
    expect(root.querySelector("h2")?.textContent).toBe("Notes");
    expect(readTemplate(root)).toEqual({ name: "reflist", params: {} });
  });

  it("does NOT translate arbitrary section headings outside Notes/References", () => {
    const root = buildRoot(
      `<h2>External links</h2>${transclusion("Some other template")}`,
    );

    const count = localizeReferenceSections(root, FA_SECTION_LOCALIZATION);

    expect(count).toBe(0);
    expect(root.querySelector("h2")?.textContent).toBe("External links");
    expect(readTemplate(root).name).toBe("Some other template");
  });

  it("does not touch a reflist-like template that sits outside any Notes/References section", () => {
    const root = buildRoot(`<h2>External links</h2>${transclusion("reflist")}`);

    localizeReferenceSections(root, FA_SECTION_LOCALIZATION);

    expect(readTemplate(root).name).toBe("reflist");
  });

  it("scopes localization to templates within that section only, leaving a later unrelated section's content alone", () => {
    const root = buildRoot(
      `<h2>Notes</h2>${transclusion("reflist")}<h2>External links</h2>${transclusion("Some other template")}`,
    );

    localizeReferenceSections(root, FA_SECTION_LOCALIZATION);

    const templates = [...root.querySelectorAll('[typeof="mw:Transclusion"]')]
      .map((el) => JSON.parse(el.getAttribute("data-mw") ?? "{}"))
      .map((d) => d.parts[0].template.target.wt);
    expect(templates).toEqual(["پانویس", "Some other template"]);
  });
});

describe("WikitextGenerator — Notes/References section localization integration", () => {
  it("sends the localized heading + template to the transform endpoint for fa", async () => {
    const html = `<h2>Notes</h2>${transclusion("reflist")}`;
    const ir = buildIRFromParsoidHtml(html, "Test");

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => "== پانویس ==\n{{پانویس}}",
    })) as unknown as ReturnType<typeof vi.fn>;
    vi.stubGlobal("fetch", fetchMock);

    const generator = new WikipediaWikitextGenerator();
    const result = await generator.generate(ir, FA_TARGET_WIKI);

    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(call[1].body as string) as { html: string };

    expect(sentBody.html).toContain("پانویس");
    expect(sentBody.html).not.toContain(">Notes<");
    expect(result).toBe("== پانویس ==\n{{پانویس}}");
  });

  it("leaves Notes/References completely unchanged for tj (no config yet)", async () => {
    const html = `<h2>Notes</h2>${transclusion("reflist")}`;
    const ir = buildIRFromParsoidHtml(html, "Test");

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => "== Notes ==\n{{reflist}}",
    })) as unknown as ReturnType<typeof vi.fn>;
    vi.stubGlobal("fetch", fetchMock);

    const generator = new WikipediaWikitextGenerator();
    await generator.generate(ir, TJ_TARGET_WIKI);

    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(call[1].body as string) as { html: string };

    expect(sentBody.html).toContain(">Notes<");
    expect(sentBody.html).toContain("reflist");
    expect(sentBody.html).not.toContain("پانویس");
  });

  it("does not localize anything when targetWiki is omitted (regression guard)", async () => {
    const html = `<h2>Notes</h2>${transclusion("reflist")}`;
    const ir = buildIRFromParsoidHtml(html, "Test");

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => "unused",
    })) as unknown as ReturnType<typeof vi.fn>;
    vi.stubGlobal("fetch", fetchMock);

    const generator = new WikipediaWikitextGenerator();
    await generator.generate(ir);

    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(call[1].body as string) as { html: string };
    expect(sentBody.html).toContain(">Notes<");
  });
});
