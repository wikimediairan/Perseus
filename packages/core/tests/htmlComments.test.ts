import { DOMParser } from "linkedom";
import { beforeAll, describe, expect, it } from "vitest";
import { buildIRFromParsoidHtml } from "../src/stages/02-parsing/ParsoidParser";
import { reconstructHtmlFromPlaceholders } from "../src/stages/02-parsing/placeholders";

beforeAll(() => {
  (globalThis as Record<string, unknown>).DOMParser = DOMParser;
});

describe("HTML comments — additional requirement", () => {
  it("a comment's content is never sent to translation", () => {
    const html = `<p>Some prose.<!--(filename only, i.e. without "File:" prefix)--> More prose.</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");
    const all = ir.textNodes.map((n) => n.text).join("\n");
    expect(all).not.toContain("filename only");
  });

  it("a comment round-trips back into the reconstructed output unchanged", () => {
    const html = `<p>Some prose.<!--(filename only, i.e. without "File:" prefix)--> More prose.</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");
    const node = ir.textNodes[0];
    const placeholders = ir.structure.placeholders.get(node.id) ?? [];

    // Simulate translation leaving the placeholder token untouched.
    const rebuilt = reconstructHtmlFromPlaceholders(
      node.text,
      placeholders,
      ir.citations,
    );

    expect(rebuilt).toContain(
      '<!--(filename only, i.e. without "File:" prefix)-->',
    );
  });

  it("surrounding prose still translates normally with a comment present", () => {
    const html = `<p>Some prose.<!-- internal note --> More prose.</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");
    expect(ir.textNodes).toHaveLength(1);
    expect(ir.textNodes[0].text).toContain("Some prose.");
    expect(ir.textNodes[0].text).toContain("More prose.");
    expect(ir.textNodes[0].text).not.toContain("internal note");
  });
});
