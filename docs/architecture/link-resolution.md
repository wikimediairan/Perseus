> Was a sentence unclear? Instead of ignoring it, make a simple 'edit' and leave your name in the
> history of this page's improvement.

# Link Resolution

This document covers everything Perseus does to decide what a link should point to on the target
wiki, and separately, how that decision becomes part of the final Wikitext. Keeping those two things
separate is itself an architectural rule — see Architectural Principle 7 — because conflating them is
exactly what caused the bug described in
[Parsing & Parsoid Integration](./parsing-and-parsoid.md#lesson-a-new-transclusion-must-be-a-real-transclusion-node).

## What gets resolved, and by what

`WikidataLinkResolver.resolve(ir)` resolves THREE kinds of title in one combined batch:

1. Ordinary internal links (`ir.links`, from body `<a rel="mw:WikiLink">` elements).
2. Categories (`ir.categories`, from `<link rel="mw:PageProp/Category">` elements).
3. Wikilink targets found inside translatable template parameters (`ir.structure.templateLinkTargets`
   — see [Template Handling](./template-handling.md)), which have no DOM `<a>` element to mutate.

All three are resolved via Wikidata's `wbgetentities` API: "give me the Wikidata item whose `enwiki`
sitelink title matches this title, and tell me its `{targetWiki.code}wiki` sitelink, if any." This is
a direct Wikidata query, not MediaWiki's `langlinks` API, and not any form of fuzzy/heuristic matching
— given a clean input title, resolution is fully deterministic. Requests are batched up to 50 titles
at a time.

## Fragments

An internal wikilink can carry a `#Section` fragment (`[[Special relativity#History]]`). Wikidata
sitelink titles never carry a fragment — a sitelink points at a page, not a page section — so a
fragment-carrying title sent to `wbgetentities` will never match, even when the base article obviously
has a target-wiki equivalent.

`LinkNode.originalTarget` is guaranteed fragment-free (the fragment is captured separately, in
`LinkNode.fragment`, for potential future use). The fragment is deliberately NOT re-attached to a
resolved link's `href`: a section anchor's name is itself language-specific, and Perseus has no way to
verify or translate it, so linking to the correct ARTICLE (dropping the fragment) is treated as
strictly more valuable than preserving a fragment that may not resolve to anything meaningful once
translated. Template-parameter wikilink targets are stripped of fragments the same way, for the same
reason, at tokenization time.

## Redirects

A link's `href` reflects whatever title was literally written in the Wikitext — Parsoid does not
resolve redirects when converting Wikitext to HTML. Since Wikidata sitelinks only exist for a page's
CANONICAL title, a link to a redirect (`[[USA]]`, which redirects to `United States`) would otherwise
always fail resolution even when the canonical article has an obvious target-wiki equivalent.

Before querying Wikidata, every distinct title in the combined batch is checked against MediaWiki's
own core API (`action=query&redirects=1`, `RedirectResolver.ts`), and redirect titles are queried
against Wikidata under their canonical form instead. This step is deliberately, and unusually,
NON-FATAL: unlike every other network call in this codebase, a redirect-lookup failure (network error,
non-2xx response, malformed body) degrades to treating the title as non-redirected and continues,
rather than failing the whole link-resolution stage. A title that legitimately isn't a redirect is
simply absent from the result and unaffected either way. This makes redirect resolution a best-effort
QUALITY IMPROVEMENT on top of link resolution, not a hard prerequisite for it — failing the entire
pipeline run over a transient redirect-lookup hiccup would be a strictly worse outcome than the
degraded-but-still-functional fallback.

## Missing target-wiki pages, and the interwiki fallback

A title with no Wikidata entity at all — or an entity with no sitelink for the target wiki — resolves
to `resolvedTarget: null`. This is a normal, expected outcome, not an error (Wikidata being
UNREACHABLE, by contrast, is a hard failure for the whole stage — see [pipeline.md](./pipeline.md#failure-model)).

When no target-wiki article exists, Perseus can fall back to an interwiki-style template call rather
than leaving the link silently pointed at the English article. `TargetWikiDefinition.interwikiFallbackTemplate`
(see [Target Wiki](./target-wiki.md)) names this template per target wiki — currently `"پم"` for
Persian, backed by
[fa.wikipedia.org's own documentation](https://fa.wikipedia.org/wiki/الگو:پیوند_با_میان‌ویکی), and
`null` for Tajik (no verified equivalent template — `null` means the pre-fallback-feature behavior is
kept exactly: an unresolved link stays pointed at the English article).

### `{{پم|label|target}}`

Where this fallback is actually CONSTRUCTED differs by which of the two link kinds it applies to,
because only one of them has access to `targetWiki` at the right time:

- **Ordinary body links** — `stages/09-generation/interwikiFallback.ts`'s
  `applyInterwikiFallbackLinks`, run from `WikitextGenerator.generate` (see
  [pipeline-stages.md](./pipeline-stages.md#9-09-generation--generate-wikitext-wikitextgeneratorts)).
- **Template-parameter links** — `templateWikitextTokens.ts`'s `reconstructWikitextValue`, run at
  Merge/commit time (see [Template Handling](./template-handling.md)).

### Why this runs at generation time (for ordinary links)

Rendering the fallback needs `TargetWikiDefinition.interwikiFallbackTemplate`, but only
`WikitextGenerator.generate` receives a `TargetWikiDefinition` — `Merger.merge` does not. Waiting
until generation time also sidesteps a subtler problem: after Merge, the ORIGINAL `<a>` element
reference held in `ir.structure.linkElements` is a detached, stale DOM node.
`reconstructHtmlFromPlaceholders` builds a fresh HTML STRING (reading the original element's live
attributes first) and assigns it to the parent block's `innerHTML`, which makes the DOM implementation
parse and construct a BRAND NEW `<a>` element — the old JS reference still points at the orphaned
pre-merge node, with the untranslated label. Rather than track element identity through Merge,
`applyInterwikiFallbackLinks` runs on the LIVE, post-merge tree and re-derives which links are
unresolved from data that survives an innerHTML round-trip: an unresolved link's `href` was NEVER
mutated by `WikidataLinkResolver` (it only rewrites `href` when `resolvedTarget` is truthy), so it is
still exactly the original `./EncodedEnglishTitle` — decoding it and looking it up against `ir.links`
(keyed by original English title) is sufficient, with no need to track DOM node identity across Merge
at all.

### The representation itself

`interwikiFallback.ts` builds a real Parsoid transclusion element — `<span typeof="mw:Transclusion"
about="#mwt<n>" data-mw="...">` — never a plain text node (see
[Parsing & Parsoid Integration](./parsing-and-parsoid.md#lesson-a-new-transclusion-must-be-a-real-transclusion-node)
for why). `about` ids only need to be unique within one generation pass, minted by a simple local
counter. Because Parsoid's serializer regenerates `{{...}}` from `data-mw` alone, the span's own inner
HTML is left empty.

For template-parameter links, by contrast, the fallback text is embedded directly as a raw Wikitext
STRING inside an EXISTING template's own `data-mw` parameter value — a fundamentally different
serialization context (see [Template Handling](./template-handling.md)) where Perseus itself, not
Parsoid, is responsible for producing valid Wikitext, including escaping a literal `|` or `=` in the
label via the standard `{{!}}` / `{{=}}` idiom.

## What is NOT currently handled

- **Namespace filtering** — every `a[rel~="mw:WikiLink"]` is sent through resolution regardless of
  namespace (`File:`, `Template:`, `Help:`, ...). This is a minor inefficiency (extra Wikidata lookups
  that correctly resolve to `null`), not a correctness bug.
- **Section-anchor translation** — a dropped fragment is never replaced with anything; Perseus has no
  mechanism to determine or translate what the equivalent anchor would be on the target wiki.
