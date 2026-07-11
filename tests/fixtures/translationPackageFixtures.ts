export const BASE_SESSION_META = {
  articleTitle: "X",
  sourceLanguage: "en",
  targetWiki: "fa",
  exportedAt: "now",
  chunkCharBudget: 2500,
};

export const INVALID_TRANSLATION_SESSIONS: [string, unknown][] = [
  [
    "missing snapshot",
    {
      format: "perseus-package",
      formatVersion: 2,
      meta: BASE_SESSION_META,
      provenance: { rawWikitext: "x" },
      chunks: [],
    },
  ],
  [
    "wrong format marker",
    {
      format: "some-other-format",
      formatVersion: 2,
      meta: BASE_SESSION_META,
      snapshot: { parsoidHtml: "<p></p>" },
      provenance: { rawWikitext: "x" },
      chunks: [],
    },
  ],
  [
    "wrong format version",
    {
      format: "perseus-package",
      formatVersion: 99,
      meta: BASE_SESSION_META,
      snapshot: { parsoidHtml: "<p></p>" },
      provenance: { rawWikitext: "x" },
      chunks: [],
    },
  ],
  [
    "unsupported target wiki",
    {
      format: "perseus-package",
      formatVersion: 2,
      meta: { ...BASE_SESSION_META, targetWiki: "xx" },
      snapshot: { parsoidHtml: "<p></p>" },
      provenance: { rawWikitext: "x" },
      chunks: [],
    },
  ],
  [
    "tuple with wrong arity",
    {
      format: "perseus-package",
      formatVersion: 2,
      meta: BASE_SESSION_META,
      snapshot: { parsoidHtml: "<p></p>" },
      provenance: { rawWikitext: "x" },
      chunks: [{ id: "chunk-1", translation: [[1, "p"]] }],
    },
  ],
];
