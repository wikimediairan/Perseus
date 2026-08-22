> Was a sentence unclear? Instead of ignoring it, make a simple 'edit' and leave your name in the
> history of this page's improvement.

# Pipeline Stages

Detailed reference for each stage: purpose, inputs/outputs, invariants, what it must not do, and its
dependencies on neighboring stages. See [pipeline.md](./pipeline.md) for the overall sequence and
[Intermediate Representation](./intermediate-representation.md) for the shared data model every stage
reads or writes.

## 1. `01-input` — Load Article (`InputLoader.ts`)

**Purpose:** turn an `en.wikipedia.org` article URL into raw Wikitext plus revision metadata. Does not
parse anything.

**Input:** `ArticleSource { url }`.
**Output:** `LoadedArticle { sourceTitle, rawWikitext, source, revision }`.

Uses MediaWiki core's REST API page-source endpoint
(`GET /w/rest.php/v1/page/{title}`), which conveniently returns the raw Wikitext (`.source`) and the
current revision id (`.id` / `.latest.id`) in one call.

**Invariants:** the URL's hostname must start with `en.` and end in `.wikipedia.org`. An empty or
missing `.source`/`.id` in the response is treated as a malformed upstream response, not silently
accepted.

**Must not:** parse Wikitext, or make any assumption about article structure — that is exclusively
Parsing's job.

**Known gap:** unlike every other Wikimedia-facing request in this codebase, this stage's `fetch` call
does not currently send the `WIKIMEDIA_USER_AGENT` header (see `config/constants.ts`). This is a
pre-existing condition, not something this documentation pass changed.

## 2. `02-parsing` — Parse with Parsoid (`ParsoidParser.ts`)

**Purpose:** obtain real Parsoid HTML for the article (network) and build the
[Intermediate Representation](./intermediate-representation.md) from it (pure).

Deliberately split into two halves that share one pure builder:

- `fetchParsoidHtml(rawWikitext, sourceTitle)` / `fetchRevisionHtml(revisionId)` — the two ways to
  obtain Parsoid HTML, by fresh Wikitext or by immutable revision id (see
  [Parsing & Parsoid Integration](./parsing-and-parsoid.md) for exactly which REST endpoints these
  call).
- `buildIRFromParsoidHtml(html, sourceTitle, logger?)` — a PURE function of its `html` argument. Every
  id it generates is a deterministic function of the HTML string alone, with no module-level counters
  — this determinism is what makes a saved [Translation Session](./translation-session.md) resumable
  at all (see Architectural Principle 9).

**Output:** a fully-populated IR — `links`, `categories`, `textNodes`, `citations`, and the DOM-backed
`structure`.

**Internal passes, and why they exist as separate passes:**

1. Build the `CitationRegistry` FIRST (`citationRegistryBuilder.ts`), before anything else, because
   the block-level text loop and the link loop both need to recognize citation markers to correctly
   exclude them.
2. Collect reference-section elements (`referenceSections.ts`) — a single top-down DOM walk using a
   level-keyed stack that mirrors Wikipedia's own heading-nesting rules, so an entire References /
   Notes / Bibliography section (by a fixed, English-only set of recognized heading names) is excluded
   from every later pass.
3. Walk `a[rel~="mw:WikiLink"]` for ordinary internal links, and `link[rel~="mw:PageProp/Category"]`
   for categories — both skip anything inside a reference section or a template transclusion.
4. Walk translatable block-level elements (`p`, `li`, `td`, `th`, ... — see
   `TRANSLATABLE_BLOCK_SELECTOR`), flattening each into placeholder-encoded text (see
   [Parsing & Parsoid Integration](./parsing-and-parsoid.md#the-placeholder-protocol)). Only the
   INNERMOST eligible block becomes a `TextNode` when blocks are nested.
5. Extract translatable template-parameter units (`templateParameters.ts`) — a second, separate pass
   over allow-listed templates' `data-mw`, continuing the SAME id counter so ids stay unique across
   both text-node sources. See [Template Handling](./template-handling.md).

**Must not:** parse Wikitext itself (Architectural Principle 3), or assume Parsoid's HTML shape is
stable across versions without it being visible in `typeof`/`data-mw`/`rel` attributes it already
reads.

## 3. `03-link-resolution` — Resolve Wikidata Links (`WikidataLinkResolver.ts`)

**Purpose:** for every link, category, and translatable template-parameter wikilink target, resolve a
target-wiki equivalent via Wikidata, and (for ordinary DOM-backed links/categories) rewrite the live
`href` in place.

Full behavior — including redirect canonicalization and the interwiki fallback — is documented in
[Link Resolution](./link-resolution.md). Summary of what this stage owns:

- Batches every distinct title (links + categories + template-parameter link targets) into ONE
  combined Wikidata `wbgetentities` request sequence (50 titles per batch).
- Canonicalizes redirect titles against MediaWiki's own API before querying Wikidata.
- Writes `LinkNode.resolvedTarget` / `CategoryNode.resolvedTarget` (`string | null`), and, separately,
  `IRStructure.templateLinkResolutions` for template-parameter link targets.
- Mutates `<a href>`/`<link href>` for resolved ordinary links/categories only. An unresolved link's
  `href` is left completely untouched here — deciding what an unresolved link's FINAL representation
  looks like is Wikitext Generation's job, not this stage's (Architectural Principle 7).

**Must not:** construct literal Wikitext or HTML for the "no target-wiki equivalent" case. This stage
only ever decides a semantic outcome (a title, or `null`).

## 4. `04-extraction` — Extract Translatable Nodes (`Extractor.ts`)

**Purpose:** filter `ir.textNodes` down to a `TranslationWorklist` of nodes actually worth sending to
translation.

**Rule:** strip placeholder tokens, then reject anything empty/whitespace-only or containing no
Unicode letter characters at all (`\p{L}`) — i.e. pure digits, punctuation, or symbols. The Unicode-
aware check matters specifically because Perseus's target scripts (Persian, Tajik) are non-Latin; an
ASCII-only check would misclassify already-foreign-script content.

**Must not:** touch the DOM, or make any decision about WHICH nodes exist — that was already decided
by Parsing (and, for template parameters, by the allow-list in
[Template Handling](./template-handling.md)). Extraction only filters.

## 5. `05-chunking` — Chunking (`Chunker.ts`)

**Purpose:** group `TranslationUnit[]` into `Chunk[]` bounded by a character budget
(`DEFAULT_MAX_CHUNK_CHARS = 2500`), never splitting a single unit across two chunks.

**Algorithm:** greedy accumulation — flush the current chunk whenever adding the next unit would
exceed the budget AND the current chunk is non-empty. A single unit longer than the budget still gets
its own (over-budget) chunk rather than being split or dropped.

**Must not:** reorder units, or change a unit's `sourceText`. Chunking is purely a grouping decision.

See [Chunking & Translation](./chunking-and-translation.md) for the full translation protocol chunks
participate in.

## 6. `06-translation` — Translation

**Purpose:** turn a `Chunk` into a `TranslatedChunk` via one of two `Translator` implementations
selected by the configured provider — see [LLM Providers](./llm-providers.md) for the full protocol,
provider abstraction, and the important gap between how thoroughly each implementation validates its
own output before merge.

## 7. `07-merge` — Merge (`Merger.ts`)

**Purpose:** write translated text back into the live DOM (or, for template-parameter nodes, into
`data-mw` via the writer closure `templateParameters.ts` registered — see
[Template Handling](./template-handling.md)).

**Invariant enforced BEFORE any mutation:** every referenced node id must exist in both `ir.textNodes`
and `ir.structure.nodeElements`. This is checked in a full validation pass over ALL chunks/units before
the mutation pass begins, so a malformed chunk throws `MergeError` with ZERO partial mutation — an
all-or-nothing guarantee for a single `merge()` call.

**Branch per unit:** if `ir.structure.templateParamWriters` has this node id, call the writer (updates
`data-mw`, never touches `innerHTML`); otherwise, `element.innerHTML = reconstructHtmlFromPlaceholders(...)`.

**Must not:** validate placeholder-token integrity itself — that is the translator's/protocol's job
(see [Chunking & Translation](./chunking-and-translation.md)); Merger trusts the `TranslatedUnit`s it
is given.

## 8. Reference Attention (not a numbered pipeline stage) (`ReferenceAttention.ts`)

**Purpose:** heuristically annotate each `TextNode` with whether it likely needs closer human
attention around its citations once translated (e.g. a claim whose citation sits awkwardly relative to
sentence boundaries after translation-driven reordering).

`HeuristicReferenceAttentionClassifier.classify(ir)` is a pure function — it reads `TextNode.text` and
returns a fresh `ReferenceAttentionAnnotation[]`, mutating nothing.

**Current state, documented precisely because it is easy to assume otherwise:**
`Pipeline.classifyReferenceAttention(ir)` calls the classifier and DISCARDS its return value. As
written, this specific convenience method has no observable effect on anything downstream in this
codebase. Whatever is meant to consume these annotations (most plausibly a desktop-application UI
layer, outside this repository) is not something this repository's code shows a path to today. This is
recorded as a fact about current behavior, not fixed as part of this documentation pass — see
Architectural Principle 15 in the task that produced this documentation set ("preserve behavior").

**Must not:** gate or block progression to any other stage — explicitly advisory-only, by design.

## 9. `09-generation` — Generate Wikitext (`WikitextGenerator.ts`)

**Purpose:** serialize the (now target-language) live DOM back to Wikitext via Parsoid's HTML-to-
Wikitext transform, after two DOM-mutating passes specific to this stage.

**Two passes, both post-merge, pre-serialization, both requiring `targetWiki` (which only this stage
receives — see [Link Resolution](./link-resolution.md#why-this-runs-at-generation-time) for why that
matters):**

1. `removeDenylistedTemplates(root, targetWiki.templateRemovalDenylist)` — strips template
   transclusions whose name matches a target-wiki-specific denylist (source-language editing-
   convention markers with no meaning once translated).
2. `applyInterwikiFallbackLinks(root, ir, targetWiki)` — rewrites any ordinary body link with no
   target-wiki equivalent into a real Parsoid transclusion element for the target wiki's interwiki
   fallback template. See [Link Resolution](./link-resolution.md#the-interwiki-fallback).

**Output:** the final Wikitext string — the last thing Perseus produces; publishing it is a manual
step outside this repository (Architectural Principle 1).

**Must not:** post-process the SERIALIZED Wikitext string with text substitution to fix up anything.
Every representation decision has to be made in the DOM, before the HTML-to-Wikitext transform call,
so that Parsoid's own serializer — not Perseus — is what turns structure into syntax. See
[Parsing & Parsoid Integration](./parsing-and-parsoid.md#lesson-a-new-transclusion-must-be-a-real-transclusion-node)
for the concrete bug this rule exists to prevent.
