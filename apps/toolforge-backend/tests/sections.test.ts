import { describe, expect, it } from "vitest";
import { buildSections, selectSections } from "../src/perseus/sections.js";

function requireSection(
  built: ReturnType<typeof buildSections>,
  title: string,
) {
  const section = built.flat.find((item) => item.title === title);
  if (!section) throw new Error(`Missing test section: ${title}`);
  return section;
}

function ref(name: string, body?: string): string {
  const dataMw: Record<string, unknown> = { attrs: { name } };
  if (body) dataMw.body = { html: body };
  return `<sup typeof="mw:Extension/ref" data-mw='${JSON.stringify(dataMw).replaceAll("'", "&#39;")}'></sup>`;
}

describe("section tree", () => {
  it("builds a heading hierarchy with lead excluded from the tree", () => {
    const html = `
      <p>Lead text.</p>
      <h2>History</h2>
      <p>History text.</p>
      <h3>Early history</h3>
      <p>Early text.</p>
      <h2>Legacy</h2>
      <p>Legacy text.</p>
    `;

    const built = buildSections(html);
    expect(built.tree).toHaveLength(2);
    expect(built.tree[0]?.title).toBe("History");
    expect(built.tree[0]?.children[0]?.title).toBe("Early history");
    expect(built.tree[0]?.hasOwnText).toBe(true);
    expect(built.tree[1]?.title).toBe("Legacy");
  });

  it("marks a parent without its own prose as having no own text", () => {
    const html = `
      <h2>Parent</h2>
      <h3>Child</h3>
      <p>Child text.</p>
    `;

    const built = buildSections(html);
    expect(built.tree[0]?.hasOwnText).toBe(false);
    expect(built.tree[0]?.children[0]?.hasOwnText).toBe(true);
  });
});

describe("selectSections", () => {
  const html = `
    <p>Lead text.</p>
    <h2>History</h2>
    <p>History text.</p>
    <h3>Early history</h3>
    <p>Early text.</p>
    <h2>Legacy</h2>
    <p>Legacy text.</p>
  `;

  it("keeps the ancestor heading while dropping its own text", () => {
    const built = buildSections(html);
    const history = requireSection(built, "History");
    const early = requireSection(built, "Early history");
    const legacy = requireSection(built, "Legacy");

    const selected = selectSections(html, {
      lead: false,
      sections: {
        [history.id]: { selected: true, ownText: false },
        [early.id]: { selected: true, ownText: true },
        [legacy.id]: { selected: false, ownText: false },
      },
    });

    expect(selected.html).toContain("History");
    expect(selected.html).toContain("Early history");
    expect(selected.html).toContain("Early text.");
    expect(selected.html).not.toContain("History text.");
    expect(selected.html).not.toContain("Legacy");
  });

  it("drops the lead when lead is not selected", () => {
    const built = buildSections(html);
    const selected = selectSections(html, {
      lead: false,
      sections: Object.fromEntries(
        built.flat.map((section) => [
          section.id,
          { selected: true, ownText: true },
        ]),
      ),
    }).html;
    expect(selected).not.toContain("Lead text.");
    expect(selected).toContain("History text.");
  });

  it("rejects an unknown section id", () => {
    expect(() =>
      selectSections(html, {
        lead: true,
        sections: { "sec-999": { selected: true, ownText: true } },
      }),
    ).toThrow(/structure changed/i);
  });

  it("rejects a completely empty selection", () => {
    const built = buildSections(html);
    expect(() =>
      selectSections(html, {
        lead: false,
        sections: Object.fromEntries(
          built.flat.map((section) => [
            section.id,
            { selected: false, ownText: false },
          ]),
        ),
      }),
    ).toThrow(/No content is selected/i);
  });
});

describe("reference preservation", () => {
  it("retains a reference section whose definitions are used by selected text", () => {
    const html = `
      <h2>Usage</h2>
      <p>Selected sentence.${ref("a")}</p>
      <h2>Sources</h2>
      <p>${ref("a", "<p>Source body</p>")}</p>
    `;

    const built = buildSections(html);
    const usage = requireSection(built, "Usage");
    const sources = requireSection(built, "Sources");

    const selected = selectSections(html, {
      lead: false,
      sections: {
        [usage.id]: { selected: true, ownText: true },
        [sources.id]: { selected: false, ownText: false },
      },
    });

    expect(selected.html).toContain("Selected sentence.");
    expect(selected.html).toContain("Source body");
    expect(selected.warnings.join(" ")).toMatch(/منابع/);
  });

  it("retains a definition block outside a reference section and asks for a references list", () => {
    const html = `
      <h2>Usage</h2>
      <p>Selected sentence.${ref("a")}</p>
      <h2>Appendix</h2>
      <p>${ref("a", "<p>Source body</p>")}</p>
    `;

    const built = buildSections(html);
    const usage = requireSection(built, "Usage");
    const appendix = requireSection(built, "Appendix");

    const selected = selectSections(html, {
      lead: false,
      sections: {
        [usage.id]: { selected: true, ownText: true },
        [appendix.id]: { selected: false, ownText: false },
      },
    });

    expect(selected.html).toContain("Source body");
    expect(selected.needsReferencesList).toBe(true);
  });
});
