import { DOMParser } from "linkedom";
import { beforeAll, describe, expect, it } from "vitest";
import { buildIRFromParsoidHtml } from "../src/stages/02-parsing/ParsoidParser";

beforeAll(() => {
  (globalThis as Record<string, unknown>).DOMParser = DOMParser;
});

describe("Link fragment stripping — Task 1 (P0 fix)", () => {
  it("strips a #Section fragment from an ordinary internal wikilink's originalTarget", () => {
    const html = `<p>See the <a rel="mw:WikiLink" href="./Special_relativity#History">history</a> section.</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");

    expect(ir.links).toHaveLength(1);
    // originalTarget preserves underscores exactly as extracted from the
    // href (normalization to spaces happens later, in
    // WikidataLinkResolver's normalizeTitle) -- what matters here is
    // that the fragment is gone.
    expect(ir.links[0].originalTarget).toBe("Special_relativity");
  });

  it("captures the stripped fragment separately on LinkNode.fragment", () => {
    const html = `<p><a rel="mw:WikiLink" href="./Special_relativity#History">History</a></p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");

    expect(ir.links[0].fragment).toBe("History");
  });

  it("LinkNode.fragment is null when the link has no fragment at all (regression guard)", () => {
    const html = `<p>The <a rel="mw:WikiLink" href="./Sun">Sun</a> is a star.</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");

    expect(ir.links[0].originalTarget).toBe("Sun");
    expect(ir.links[0].fragment).toBeNull();
  });

  it("a multi-word title with a fragment decodes and strips correctly (fragment removed, underscore preserved until normalizeTitle)", () => {
    const html = `<p><a rel="mw:WikiLink" href="./Ada_Lovelace#Early_life">Ada's early life</a></p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");

    expect(ir.links[0].originalTarget).toBe("Ada_Lovelace");
    expect(ir.links[0].fragment).toBe("Early_life");
  });

  it("categories continue to strip fragments exactly as before (regression guard — shared stripFragment helper)", () => {
    const html = `<link rel="mw:PageProp/Category" href="./Category:Physics#SomeAnchor"/>`;
    const ir = buildIRFromParsoidHtml(html, "Test");

    expect(ir.categories).toHaveLength(1);
    expect(ir.categories[0].originalTarget).toBe("Physics");
  });

  it("a link with an empty fragment (bare trailing #) is treated as having no fragment", () => {
    const html = `<p><a rel="mw:WikiLink" href="./Sun#">Sun</a></p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");

    expect(ir.links[0].originalTarget).toBe("Sun");
    expect(ir.links[0].fragment).toBeNull();
  });
});
