export const BASE_SESSION_META = {
  sourceLanguage: "en",
  targetWiki: "fa",
  exportedAt: "now",
  chunkCharBudget: 2500,
};

export const BASE_SESSION_SOURCE = {
  wiki: "enwiki",
  pageId: 736,
  title: "X",
  revisionId: 123456789,
};

export const INVALID_TRANSLATION_SESSIONS: [string, unknown][] = [
  [
    "missing source",
    {
      format: "perseus-package",
      formatVersion: 3,
      meta: BASE_SESSION_META,
      chunks: [],
    },
  ],
  [
    "wrong format marker",
    {
      format: "some-other-format",
      formatVersion: 3,
      meta: BASE_SESSION_META,
      source: BASE_SESSION_SOURCE,
      chunks: [],
    },
  ],
  [
    "wrong format version",
    {
      format: "perseus-package",
      formatVersion: 99,
      meta: BASE_SESSION_META,
      source: BASE_SESSION_SOURCE,
      chunks: [],
    },
  ],
  [
    "unsupported target wiki",
    {
      format: "perseus-package",
      formatVersion: 3,
      meta: { ...BASE_SESSION_META, targetWiki: "xx" },
      source: BASE_SESSION_SOURCE,
      chunks: [],
    },
  ],
  [
    "unsupported source wiki",
    {
      format: "perseus-package",
      formatVersion: 3,
      meta: BASE_SESSION_META,
      source: { ...BASE_SESSION_SOURCE, wiki: "fawiki" },
      chunks: [],
    },
  ],
  [
    "tuple with wrong arity",
    {
      format: "perseus-package",
      formatVersion: 3,
      meta: BASE_SESSION_META,
      source: BASE_SESSION_SOURCE,
      chunks: [{ id: "chunk-1", translation: [[1, "p"]] }],
    },
  ],
];
