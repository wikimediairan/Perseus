import { DOMParser } from "linkedom";
import { beforeAll, describe, expect, it } from "vitest";
import { buildIRFromParsoidHtml } from "../src/stages/02-parsing/ParsoidParser";
import { reconstructHtmlFromPlaceholders } from "../src/stages/02-parsing/placeholders";
import { WikipediaExtractor } from "../src/stages/04-extraction/Extractor";

beforeAll(() => {
  (globalThis as Record<string, unknown>).DOMParser = DOMParser;
});

describe("External links — issue 6", () => {
  it("a bare/autolinked external link (label === href) is NOT sent to translation", () => {
    const url = "http://naira-hovakimyan.mechse.illinois.edu/";
    const html = `<ul><li><a rel="mw:ExtLink" href="${url}">${url}</a></li></ul>`;

    const ir = buildIRFromParsoidHtml(html, "Test");
    const allText = ir.textNodes.map((n) => n.text).join("\n");

    expect(allText).not.toContain(url);
  });

  it("an external link with a real human label IS sent to translation, and the URL is not", () => {
    const url = "https://scholar.google.com/citations?user=8mA9QpUAAAAJ&hl=en";
    const label = "گوگل اسکالر";
    const html = `<p><a rel="mw:ExtLink" href="${url}">${label}</a></p>`;

    const ir = buildIRFromParsoidHtml(html, "Test");
    const allText = ir.textNodes.map((n) => n.text).join("\n");

    expect(allText).toContain(label);
    expect(allText).not.toContain(url);
  });

  it("a block whose only content is a bare external link produces no translation work (Extractor filters it; original DOM is never touched)", () => {
    const url = "http://naira-hovakimyan.mechse.illinois.edu/";
    const html = `<li><a rel="mw:ExtLink" href="${url}">${url}</a></li>`;

    const ir = buildIRFromParsoidHtml(html, "Test");

    // A TextNode IS created (its raw text is just the solo placeholder
    // token, e.g. "⟪*1⟫") — but it carries no actual letters once the
    // placeholder token itself is stripped, so the real Extractor (the
    // same class used in production) excludes it from the worklist.
    // Nothing ever gets sent to translation, and since it's never in the
    // worklist, Merger never rewrites this element's innerHTML either —
    // the original DOM (and thus the original wikitext) is reproduced
    // byte-for-byte with zero risk from the translation round-trip.
    expect(ir.textNodes).toHaveLength(1);

    const worklist = new WikipediaExtractor();
    return worklist.extract(ir).then((units) => {
      expect(units).toHaveLength(0);
    });
  });

  it("a bare external link embedded inside a larger translatable sentence is preserved verbatim (via a live outerHTML read) while the rest translates", () => {
    const url = "http://example.com/";
    const html = `<p>See ${`<a rel="mw:ExtLink" href="${url}">${url}</a>`} for details.</p>`;

    const ir = buildIRFromParsoidHtml(html, "Test");
    expect(ir.textNodes).toHaveLength(1);

    const node = ir.textNodes[0];
    expect(node.text).not.toContain(url);
    expect(node.text).toBe("See ⟪*1⟫ for details.");

    // Simulate a translation that leaves the placeholder token untouched
    // (the expected/normal case) and confirm the whole block reconstructs
    // to exactly the original link element, with the surrounding prose
    // free to have been translated around it.
    const registry = ir.citations;
    const placeholders = ir.structure.placeholders.get(node.id) ?? [];
    const rebuilt = reconstructHtmlFromPlaceholders(
      node.text,
      placeholders,
      registry,
    );

    expect(rebuilt).toBe(
      `See <a rel="mw:ExtLink" href="${url}">${url}</a> for details.`,
    );
  });

  it("internal wikilinks are unaffected by the external-link change (regression guard)", () => {
    const html = `<p>The <a rel="mw:WikiLink" href="./Sun">Sun</a> is a star.</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");

    expect(ir.links).toHaveLength(1);
    expect(ir.links[0].label).toBe("Sun");
    // The label still goes through the ordinary translatable-text path too
    // (a WikiLink's <a> isn't touched by isBareExternalLink at all, since
    // it has no rel="mw:ExtLink").
    const allText = ir.textNodes.map((n) => n.text).join("\n");
    expect(allText).toContain("Sun");
  });
});
