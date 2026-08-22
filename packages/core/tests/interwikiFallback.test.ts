import { DOMParser } from "linkedom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { TargetWikiDefinition } from "../src/config/targetWikis";
import { buildIRFromParsoidHtml } from "../src/stages/02-parsing/ParsoidParser";
import { applyInterwikiFallbackLinks } from "../src/stages/09-generation/interwikiFallback";
import { WikipediaWikitextGenerator } from "../src/stages/09-generation/WikitextGenerator";
import { assertDefined } from "./helpers/assertDefined";

beforeAll(() => {
  (globalThis as Record<string, unknown>).DOMParser = DOMParser;
});

const FA_TARGET_WIKI: TargetWikiDefinition = {
  code: "fa",
  displayName: "Persian Wikipedia",
  languageName: "Persian",
  domain: "fa.wikipedia.org",
  draft: "",
  move: "",
  direction: "rtl",
  templateRemovalDenylist: [],
  interwikiFallbackTemplate: "پم",
  translationDisclosureTemplate: "{{ترجمه با کمک مدل‌های بزرگ زبانی}}",
};

const TJ_TARGET_WIKI: TargetWikiDefinition = {
  ...FA_TARGET_WIKI,
  code: "tj",
  displayName: "Tajik Wikipedia",
  interwikiFallbackTemplate: null,
  translationDisclosureTemplate: null,
};

/** Builds an IR + live root, then applies a WikidataLinkResolver-shaped resolution outcome directly (unit-testing applyInterwikiFallbackLinks in isolation, without a real network call). */
function buildResolvedIr(html: string, resolvedTarget: string | null) {
  const ir = buildIRFromParsoidHtml(html, "Test");

  if (ir.links.length > 0) {
    ir.links[0].resolvedTarget = resolvedTarget;

    if (resolvedTarget) {
      // Mirror what WikidataLinkResolver actually does on success.
      const anchor = assertDefined(
        ir.structure.linkElements.get(ir.links[0].id),
        "Expected a link element for ir.links[0] in this fixture.",
      );
      anchor.setAttribute(
        "href",
        `./${encodeURIComponent(resolvedTarget.replaceAll(" ", "_"))}`,
      );
    }
  }

  const root = assertDefined(
    ir.structure.document.getElementById("perseus-root"),
    "Expected the fixture document to have a #perseus-root element.",
  );
  return { ir, root };
}

/** Parses the data-mw JSON off the (single) transclusion element the fallback pass is expected to have produced. */
function readInterwikiDataMw(root: Element): {
  templateName: string;
  label: string;
  target: string;
} {
  const el = assertDefined(
    root.querySelector('[typeof="mw:Transclusion"]'),
    "Expected a mw:Transclusion element to have been produced by applyInterwikiFallbackLinks.",
  );
  const dataMw = JSON.parse(el.getAttribute("data-mw") ?? "{}");
  const template = dataMw.parts[0].template;
  return {
    templateName: template.target.wt,
    label: template.params["1"].wt,
    target: template.params["2"].wt,
  };
}

describe("applyInterwikiFallbackLinks", () => {
  it("rewrites an unresolved link into a REAL Parsoid transclusion element (typeof=mw:Transclusion + data-mw), not a raw text node", () => {
    const { ir, root } = buildResolvedIr(
      `<p>See <a rel="mw:WikiLink" href="./Some_Obscure_Topic">translated label</a>.</p>`,
      null,
    );

    const count = applyInterwikiFallbackLinks(root, ir, FA_TARGET_WIKI);

    expect(count).toBe(1);
    expect(root.querySelector('a[rel~="mw:WikiLink"]')).toBeNull();

    const transclusion = root.querySelector('[typeof="mw:Transclusion"]');
    expect(transclusion).not.toBeNull();
    expect(transclusion?.tagName.toLowerCase()).toBe("span");
    expect(transclusion?.getAttribute("about")).toMatch(/^#mwt\d+$/);

    const { templateName, label, target } = readInterwikiDataMw(root);
    expect(templateName).toBe("پم");
    expect(label).toBe("translated label");
    expect(target).toBe("Some_Obscure_Topic");
  });

  it("REGRESSION GUARD: never produces a literal '{{' anywhere in ordinary DOM text content -- this is exactly what triggered Parsoid's <nowiki> escaping before the fix", () => {
    const { ir, root } = buildResolvedIr(
      `<p>See <a rel="mw:WikiLink" href="./Some_Obscure_Topic">translated label</a>.</p>`,
      null,
    );

    applyInterwikiFallbackLinks(root, ir, FA_TARGET_WIKI);

    // Walk every text node in the tree; none should contain raw
    // template syntax. The ONLY place "{{" is allowed to appear is
    // inside the data-mw JSON *attribute*, which Parsoid reads
    // structurally, not as page text.
    const walker: Text[] = [];
    const collect = (node: Node) => {
      if (node.nodeType === 3) {
        walker.push(node as unknown as Text);
      }
      node.childNodes?.forEach(collect);
    };
    collect(root);

    for (const textNode of walker) {
      expect(textNode.textContent ?? "").not.toContain("{{");
    }
  });

  it("leaves a RESOLVED link completely untouched", () => {
    const { ir, root } = buildResolvedIr(
      `<p>The <a rel="mw:WikiLink" href="./Sun">Sun</a> is a star.</p>`,
      "خورشید",
    );

    const count = applyInterwikiFallbackLinks(root, ir, FA_TARGET_WIKI);

    expect(count).toBe(0);
    const anchor = root.querySelector('a[rel~="mw:WikiLink"]');
    expect(anchor).not.toBeNull();
    expect(decodeURIComponent(anchor?.getAttribute("href") ?? "")).toContain(
      "خورشید",
    );
    expect(root.querySelector('[typeof="mw:Transclusion"]')).toBeNull();
  });

  it("is a no-op when the target wiki has no interwikiFallbackTemplate configured (backward compatibility)", () => {
    const { ir, root } = buildResolvedIr(
      `<p>See <a rel="mw:WikiLink" href="./Some_Obscure_Topic">translated label</a>.</p>`,
      null,
    );

    const count = applyInterwikiFallbackLinks(root, ir, TJ_TARGET_WIKI);

    expect(count).toBe(0);
    // The unresolved link is left exactly as before this feature existed.
    const anchor = root.querySelector('a[rel~="mw:WikiLink"]');
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute("href")).toBe("./Some_Obscure_Topic");
  });

  it("uses the ANCHOR'S CURRENT (translated) label, not the original English label", () => {
    const { ir, root } = buildResolvedIr(
      `<p>See <a rel="mw:WikiLink" href="./Some_Obscure_Topic">Original label</a>.</p>`,
      null,
    );

    // Simulate Merge having already replaced the anchor's text with a
    // translated label (this is what a real merge pass produces).
    const anchor = assertDefined(
      root.querySelector('a[rel~="mw:WikiLink"]'),
      "Expected the fixture to contain one mw:WikiLink anchor.",
    );
    anchor.textContent = "برچسب ترجمه‌شده";

    applyInterwikiFallbackLinks(root, ir, FA_TARGET_WIKI);

    const { label } = readInterwikiDataMw(root);
    expect(label).toBe("برچسب ترجمه‌شده");
  });

  it("stores a literal pipe/equals in the label as a PLAIN, unescaped data-mw string value (Parsoid owns escaping it on serialization, not us)", () => {
    const { ir, root } = buildResolvedIr(
      `<p><a rel="mw:WikiLink" href="./Some_Topic">a|b=c</a></p>`,
      null,
    );

    applyInterwikiFallbackLinks(root, ir, FA_TARGET_WIKI);

    const { label } = readInterwikiDataMw(root);
    // Stored exactly as written -- no {{!}}/{{=}} substitution performed
    // by Perseus itself, since this value never gets concatenated into
    // a raw wikitext string; Parsoid regenerates the surrounding
    // template-call syntax (and any necessary argument escaping) from
    // this structured data-mw value.
    expect(label).toBe("a|b=c");
  });

  it("does not touch links belonging to a different IR (no accidental cross-matching)", () => {
    const { ir, root } = buildResolvedIr(
      `<p><a rel="mw:WikiLink" href="./Unrelated_Page">Unrelated</a></p>`,
      null,
    );
    // Simulate an IR whose `links` array doesn't actually describe this
    // DOM (a defensive/never-should-happen scenario) -- the anchor's
    // href doesn't match any LinkNode's originalTarget.
    ir.links = [];

    const count = applyInterwikiFallbackLinks(root, ir, FA_TARGET_WIKI);

    expect(count).toBe(0);
    expect(root.querySelector('a[rel~="mw:WikiLink"]')).not.toBeNull();
  });

  it("returns 0 and does nothing when there are no wikilinks at all", () => {
    const { ir, root } = buildResolvedIr(`<p>No links here.</p>`, null);
    const count = applyInterwikiFallbackLinks(root, ir, FA_TARGET_WIKI);
    expect(count).toBe(0);
  });

  it("mints a distinct 'about' id for each of multiple unresolved links in the same document", () => {
    const { ir, root } = buildResolvedIr(
      `<p><a rel="mw:WikiLink" href="./Topic_One">One</a> and <a rel="mw:WikiLink" href="./Topic_Two">Two</a></p>`,
      null,
    );

    applyInterwikiFallbackLinks(root, ir, FA_TARGET_WIKI);

    const abouts = [...root.querySelectorAll('[typeof="mw:Transclusion"]')].map(
      (el) => el.getAttribute("about"),
    );
    expect(abouts).toHaveLength(2);
    expect(new Set(abouts).size).toBe(2);
  });
});

describe("WikitextGenerator — interwiki fallback integration", () => {
  it("sends a REAL transclusion element (typeof=mw:Transclusion + data-mw) to the transform endpoint, not raw '{{...}}' text -- this is the root-cause fix for the <nowiki> bug", async () => {
    const html = `<p>See <a rel="mw:WikiLink" href="./Some_Obscure_Topic">label</a>.</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");
    ir.links[0].resolvedTarget = null;

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      // A Parsoid-correct transform, given transclusion-shaped input,
      // regenerates the template call as real wikitext syntax -- this
      // is what we assert the FINAL result equals below. (This response
      // is a stand-in for the real Parsoid service, which this test
      // environment cannot reach -- see interwikiFallback.ts's header
      // comment. What THIS test verifies unconditionally, independent
      // of that stand-in, is the shape of what we SEND: no raw "{{" in
      // ordinary text content.)
      text: async () => "See {{پم|label|Some_Obscure_Topic}}.",
    })) as unknown as ReturnType<typeof vi.fn>;
    vi.stubGlobal("fetch", fetchMock);

    const generator = new WikipediaWikitextGenerator();
    const result = await generator.generate(ir, FA_TARGET_WIKI);

    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(call[1].body as string) as { html: string };

    expect(sentBody.html).toContain('typeof="mw:Transclusion"');
    expect(sentBody.html).toContain("data-mw=");
    expect(sentBody.html).not.toContain('rel="mw:WikiLink"');

    // The literal template-call text must NOT appear as ordinary text
    // content in what we send -- it only exists inside the data-mw
    // JSON attribute, which is what actually fixes the <nowiki> bug.
    const withoutDataMwAttr = sentBody.html.replace(
      /data-mw="[^"]*"/,
      'data-mw="…"',
    );
    expect(withoutDataMwAttr).not.toContain("{{پم");

    // And the (mocked, Parsoid-correct) service's response is forwarded
    // through untouched -- Core does not post-process serialized
    // wikitext with string replacement (see the task constraints this
    // fix was built under).
    expect(result).toBe(
      "{{ترجمه با کمک مدل‌های بزرگ زبانی}}\nSee {{پم|label|Some_Obscure_Topic}}.",
    );
    expect(result).not.toContain("<nowiki>");
  });

  it("sends the canonical WIKIMEDIA_USER_AGENT header (previously missing)", async () => {
    const html = `<p>Hello.</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => "Hello.",
    })) as unknown as ReturnType<typeof vi.fn>;
    vi.stubGlobal("fetch", fetchMock);

    const generator = new WikipediaWikitextGenerator();
    await generator.generate(ir, FA_TARGET_WIKI);

    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = call[1].headers as Record<string, string>;
    expect(headers["User-Agent"]).toBeTruthy();
  });

  it("does not rewrite anything when targetWiki is omitted (regression guard -- e.g. a caller not yet passing target wiki)", async () => {
    const html = `<p>See <a rel="mw:WikiLink" href="./Some_Obscure_Topic">label</a>.</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");
    ir.links[0].resolvedTarget = null;

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
    expect(sentBody.html).toContain('rel="mw:WikiLink"');
  });

  it("resolved links still generate normal <a> markup end-to-end (unaffected by the fallback fix)", async () => {
    const html = `<p>The <a rel="mw:WikiLink" href="./Sun">Sun</a> is a star.</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");
    ir.links[0].resolvedTarget = "خورشید";
    const anchor = assertDefined(
      ir.structure.linkElements.get(ir.links[0].id),
      "Expected a link element for ir.links[0] in this fixture.",
    );
    anchor.setAttribute("href", "./خورشید");
    anchor.textContent = "خورشید";

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => "[[خورشید]] یک ستاره است.",
    })) as unknown as ReturnType<typeof vi.fn>;
    vi.stubGlobal("fetch", fetchMock);

    const generator = new WikipediaWikitextGenerator();
    const result = await generator.generate(ir, FA_TARGET_WIKI);

    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(call[1].body as string) as { html: string };

    expect(sentBody.html).toContain('rel="mw:WikiLink"');
    expect(sentBody.html).not.toContain("mw:Transclusion");
    expect(result).toBe(
      "{{ترجمه با کمک مدل‌های بزرگ زبانی}}\n[[خورشید]] یک ستاره است.",
    );
  });
});

describe("WikitextGenerator — translation disclosure template", () => {
  it("prepends the disclosure template at the very top of the final wikitext for Persian (fa)", async () => {
    const html = `<p>Hello.</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => "سلام.",
    })) as unknown as ReturnType<typeof vi.fn>;
    vi.stubGlobal("fetch", fetchMock);

    const generator = new WikipediaWikitextGenerator();
    const result = await generator.generate(ir, FA_TARGET_WIKI);

    expect(result).toBe("{{ترجمه با کمک مدل‌های بزرگ زبانی}}\nسلام.");
    expect(result.startsWith("{{ترجمه با کمک مدل‌های بزرگ زبانی}}")).toBe(true);
  });

  it("does NOT prepend anything for Tajik (tj)", async () => {
    const html = `<p>Hello.</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => "Салом.",
    })) as unknown as ReturnType<typeof vi.fn>;
    vi.stubGlobal("fetch", fetchMock);

    const generator = new WikipediaWikitextGenerator();
    const result = await generator.generate(ir, TJ_TARGET_WIKI);

    expect(result).toBe("Салом.");
    expect(result).not.toContain("ترجمه با کمک مدل‌های بزرگ زبانی");
  });

  it("does not prepend anything when targetWiki is omitted (regression guard)", async () => {
    const html = `<p>Hello.</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => "Hello.",
    })) as unknown as ReturnType<typeof vi.fn>;
    vi.stubGlobal("fetch", fetchMock);

    const generator = new WikipediaWikitextGenerator();
    const result = await generator.generate(ir);

    expect(result).toBe("Hello.");
  });

  it("prepends exactly once, with a single newline separating it from the rest of the article", async () => {
    const html = `<p>Hello.</p>`;
    const ir = buildIRFromParsoidHtml(html, "Test");

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => "خط اول.\nخط دوم.",
    })) as unknown as ReturnType<typeof vi.fn>;
    vi.stubGlobal("fetch", fetchMock);

    const generator = new WikipediaWikitextGenerator();
    const result = await generator.generate(ir, FA_TARGET_WIKI);

    const lines = result.split("\n");
    expect(lines[0]).toBe("{{ترجمه با کمک مدل‌های بزرگ زبانی}}");
    expect(lines[1]).toBe("خط اول.");
    expect(lines[2]).toBe("خط دوم.");
    expect(result.split("ترجمه با کمک مدل‌های بزرگ زبانی").length - 1).toBe(1);
  });
});
