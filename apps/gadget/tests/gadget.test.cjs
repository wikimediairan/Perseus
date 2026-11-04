const test = require("node:test");
const assert = require("node:assert/strict");
const {
  sourceWikiFromHost,
  sameSource,
  defaultSelection,
  setBranch,
  setOwnText,
  branchState,
  hasSelectedContent,
  apiBase,
  safeEquivalentUrl,
} = require("../gadget.js");

const tree = [
  {
    id: "sec-1",
    title: "History",
    hasOwnText: true,
    children: [
      { id: "sec-2", title: "Early", hasOwnText: true, children: [] },
      { id: "sec-3", title: "Modern", hasOwnText: true, children: [] },
    ],
  },
  { id: "sec-4", title: "Legacy", hasOwnText: true, children: [] },
];

test("source wiki detection matches backend source site codes", () => {
  assert.equal(sourceWikiFromHost("en.wikipedia.org"), "enwiki");
  assert.equal(sourceWikiFromHost("en.m.wikipedia.org"), "enwiki");
  assert.equal(sourceWikiFromHost("be-tarask.wikipedia.org"), "be-taraskwiki");
  assert.equal(sourceWikiFromHost("fa.wikipedia.org"), null);
  assert.equal(sourceWikiFromHost("tg.wikipedia.org"), null);
  assert.equal(sourceWikiFromHost("commons.wikimedia.org"), null);
});

test("new jobs start with all sections and lead selected", () => {
  const selection = defaultSelection(tree);
  assert.equal(selection.lead, true);
  assert.deepEqual(Object.keys(selection.sections), [
    "sec-1",
    "sec-2",
    "sec-3",
    "sec-4",
  ]);
  assert.deepEqual(selection.sections["sec-1"], {
    selected: true,
    ownText: true,
  });
  assert.equal(branchState(selection, tree[0]).all, true);
});

test("toggling a parent changes its own text and descendants", () => {
  const selection = defaultSelection(tree);
  setBranch(selection, tree[0], false);
  for (const id of ["sec-1", "sec-2", "sec-3"]) {
    assert.deepEqual(selection.sections[id], {
      selected: false,
      ownText: false,
    });
  }
  assert.equal(selection.sections["sec-4"].selected, true);
  setBranch(selection, tree[0], true);
  assert.equal(branchState(selection, tree[0]).all, true);
});

test("selecting a child does not reselect the parent own text", () => {
  const selection = defaultSelection(tree);
  setBranch(selection, tree[0], false);
  setBranch(selection, tree[0].children[0], true);
  assert.deepEqual(selection.sections["sec-1"], {
    selected: false,
    ownText: false,
  });
  assert.deepEqual(branchState(selection, tree[0]), {
    all: false,
    some: true,
  });
  assert.equal(hasSelectedContent(selection, tree), true);
});

test("parent own text can be excluded while descendants remain selected", () => {
  const selection = defaultSelection(tree);
  setOwnText(selection, tree[0], false);
  assert.deepEqual(selection.sections["sec-1"], {
    selected: true,
    ownText: false,
  });
  assert.equal(selection.sections["sec-2"].selected, true);
  assert.deepEqual(branchState(selection, tree[0]), {
    all: false,
    some: true,
  });
});

test("empty content selection disables job creation", () => {
  const selection = defaultSelection(tree);
  selection.lead = false;
  tree.forEach((section) => {
    setBranch(selection, section, false);
  });
  assert.equal(hasSelectedContent(selection, tree), false);
  setBranch(selection, tree[0].children[1], true);
  assert.equal(hasSelectedContent(selection, tree), true);
});

test("restore compares canonical source identity without relying on title spelling", () => {
  const job = {
    source: {
      wiki: "enwiki",
      title: "Test Article",
      pageId: 42,
    },
  };
  assert.equal(sameSource(job, "enwiki", "Test_Article", 42), true);
  assert.equal(sameSource(job, "enwiki", "Other title", 42), true);
  assert.equal(sameSource(job, "dewiki", "Test Article", 42), false);
  assert.equal(sameSource(job, "enwiki", "Test Article", 43), false);
});

test("API base is an HTTPS origin, not an arbitrary path", () => {
  assert.equal(
    apiBase("https://perseus.toolforge.org"),
    "https://perseus.toolforge.org",
  );
  assert.throws(() => apiBase("http://example.org"));
  assert.throws(() => apiBase("https://example.org/path"));
  assert.throws(() => apiBase("https://user:pass@example.org"));
});

test("target equivalent links remain on the selected Wikipedia", () => {
  assert.equal(
    safeEquivalentUrl("https://fa.wikipedia.org/wiki/نمونه", "fa"),
    "https://fa.wikipedia.org/wiki/%D9%86%D9%85%D9%88%D9%86%D9%87",
  );
  assert.equal(safeEquivalentUrl("javascript:alert(1)", "fa"), null);
  assert.equal(
    safeEquivalentUrl("https://tg.wikipedia.org/wiki/Test", "fa"),
    null,
  );
});
