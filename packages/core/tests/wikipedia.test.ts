import { describe, expect, it } from "vitest";

import {
  detectWikipediaSource,
  isWikipediaWikiCode,
  languageCodeFromWiki,
  parseWikipediaArticleUrl,
  wikidataSiteKeyFromWiki,
  wikipediaDomainFromWiki,
  wikipediaWikiCodeFromDomain,
} from "../src/config/wikipedia";

describe("wikipedia source helpers", () => {
  it("detects the source wiki from desktop article URLs", () => {
    expect(
      parseWikipediaArticleUrl("https://de.wikipedia.org/wiki/Ada_Lovelace"),
    ).toMatchObject({
      languageCode: "de",
      wiki: "dewiki",
      domain: "de.wikipedia.org",
      title: "Ada Lovelace",
    });
  });

  it("supports mobile hosts, hyphenated languages, and query titles", () => {
    expect(
      parseWikipediaArticleUrl(
        "https://zh-min-nan.m.wikipedia.org/wiki/Tâi-gí",
      ),
    ).toMatchObject({
      languageCode: "zh-min-nan",
      wiki: "zh-min-nanwiki",
      domain: "zh-min-nan.wikipedia.org",
      title: "Tâi-gí",
    });

    expect(
      parseWikipediaArticleUrl(
        "https://de.wikipedia.org/w/index.php?title=Geschichte",
      )?.title,
    ).toBe("Geschichte");
  });

  it("rejects non-Wikipedia URLs and incomplete article URLs", () => {
    expect(parseWikipediaArticleUrl("https://example.com/wiki/Foo")).toBeNull();
    expect(
      parseWikipediaArticleUrl("https://en.wikipedia.org/wiki/"),
    ).toBeNull();
    expect(detectWikipediaSource("not a url")).toBeNull();
  });

  it("converts between wiki codes, domains, and Wikidata site keys", () => {
    expect(wikipediaDomainFromWiki("dewiki")).toBe("de.wikipedia.org");
    expect(wikipediaDomainFromWiki("zh_min_nanwiki")).toBe(
      "zh-min-nan.wikipedia.org",
    );
    expect(wikipediaWikiCodeFromDomain("de.wikipedia.org")).toBe("dewiki");
    expect(languageCodeFromWiki("be-taraskwiki")).toBe("be-tarask");
    expect(wikipediaDomainFromWiki("be_x_oldwiki")).toBe(
      "be-tarask.wikipedia.org",
    );
    expect(wikidataSiteKeyFromWiki("be-taraskwiki")).toBe("be_x_oldwiki");
    expect(wikidataSiteKeyFromWiki("zh-min-nanwiki")).toBe("zh_min_nanwiki");
  });

  it("recognizes Wikipedia site codes", () => {
    expect(isWikipediaWikiCode("enwiki")).toBe(true);
    expect(isWikipediaWikiCode("zh_min_nanwiki")).toBe(true);
    expect(isWikipediaWikiCode("en.wikipedia.org")).toBe(false);
    expect(isWikipediaWikiCode("")).toBe(false);
  });
});
