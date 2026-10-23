import { afterEach, describe, expect, it, vi } from "vitest";

import { WikipediaInputLoader } from "../src/stages/01-input/InputLoader";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WikipediaInputLoader source language detection", () => {
  it("loads from the URL's language edition and records its wiki code", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        source: "'''Ada Lovelace'''",
        title: "Ada Lovelace",
        id: 42,
        latest: { id: 1001 },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const loaded = await new WikipediaInputLoader().load({
      url: "https://de.wikipedia.org/wiki/Ada_Lovelace",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://de.wikipedia.org/w/rest.php/v1/page/Ada%20Lovelace",
    );
    expect(loaded).toMatchObject({
      sourceTitle: "Ada Lovelace",
      revision: { wiki: "dewiki", pageId: 42, revisionId: 1001 },
    });
  });
});
