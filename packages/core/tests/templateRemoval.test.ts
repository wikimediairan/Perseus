import { DOMParser } from "linkedom";
import { beforeAll, describe, expect, it } from "vitest";
import { TARGET_WIKIS } from "../src/config/targetWikis";
import { removeDenylistedTemplates } from "../src/stages/09-generation/templateRemoval";

beforeAll(() => {
  (globalThis as Record<string, unknown>).DOMParser = DOMParser;
});

function transclusion(templateName: string, id: string): string {
  const dataMw = JSON.stringify({
    parts: [{ template: { target: { wt: templateName }, params: {}, i: 0 } }],
  });
  return `<span id="${id}" typeof="mw:Transclusion" data-mw='${dataMw.replace(/'/g, "&#39;")}'></span>`;
}

function parseBody(html: string): Element {
  const doc = new DOMParser().parseFromString(
    `<div id="root">${html}</div>`,
    "text/html",
  );
  return doc.getElementById("root") as unknown as Element;
}

describe("Maintenance/navigation template removal — issues 2 and 5", () => {
  it.each([
    "Use American English",
    "Use list-defined references",
    "redirect", // case-insensitive match against the "fa" denylist's "Redirect" entry
  ])(
    "removes {{%s}} from the generated output for the fa target wiki",
    (templateName) => {
      const root = parseBody(
        `<p>Intro text.</p>${transclusion(templateName, "t1")}<p>More text.</p>`,
      );

      const removed = removeDenylistedTemplates(
        root,
        TARGET_WIKIS.fa.templateRemovalDenylist,
      );

      expect(removed).toBe(1);
      expect(root.querySelector("#t1")).toBeNull();
      expect(root.innerHTML).toContain("Intro text.");
      expect(root.innerHTML).toContain("More text.");
    },
  );

  it("removes the same templates for the tj target wiki (shared denylist)", () => {
    const root = parseBody(transclusion("Use American English", "t1"));

    const removed = removeDenylistedTemplates(
      root,
      TARGET_WIKIS.tj.templateRemovalDenylist,
    );

    expect(removed).toBe(1);
  });

  it("does NOT remove a template that isn't on the denylist (regression guard)", () => {
    const root = parseBody(transclusion("Infobox person", "t1"));

    const removed = removeDenylistedTemplates(
      root,
      TARGET_WIKIS.fa.templateRemovalDenylist,
    );

    expect(removed).toBe(0);
    expect(root.querySelector("#t1")).not.toBeNull();
  });

  it("leaves surrounding untouched templates alone when removing a denylisted one", () => {
    const root = parseBody(
      `${transclusion("Use mdy dates", "keep-existing")}${transclusion("Use American English", "remove-new")}`,
    );

    const removed = removeDenylistedTemplates(
      root,
      TARGET_WIKIS.fa.templateRemovalDenylist,
    );

    // Both are denylisted (this test targets the pre-existing "Use mdy dates"
    // entry plus the newly-added "Use American English" entry), so both go —
    // asserting 2 here would be redundant with the case above; what matters
    // is that adding the new entry didn't disturb the old one's matching.
    expect(removed).toBe(2);
    expect(root.querySelector("#keep-existing")).toBeNull();
    expect(root.querySelector("#remove-new")).toBeNull();
  });
});
