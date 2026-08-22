> Was a sentence unclear? Instead of ignoring it, make a simple 'edit' and leave your name in the
> history of this page's improvement.

# Architectural Principles

These are the principles that explain _why_ Perseus is built the way it is, not just what it does.
Where a later document describes a mechanism, this document is where to look for the reasoning behind
it.

## 1. Perseus produces drafts, not edits

Perseus never writes to Wikipedia directly. Every pipeline run ends at generated Wikitext — a string
the human contributor still has to review, copy, and publish themselves, through Wikipedia's own
editing interface. This is a deliberate boundary, not a missing feature: it keeps a human in the loop
for the one action (publishing to a live encyclopedia) that actually matters, while letting Perseus
own everything upstream of that decision.

This is why the pipeline's own stage list ends at `generate-wikitext` (see
[pipeline.md](./pipeline.md)) rather than at "publish", and why a
[Translation Session](./translation-session.md) is designed to be saved, closed, and resumed rather
than assumed to run start-to-finish in one sitting.

## 2. The Intermediate Representation is the one thing every stage agrees on

Every pipeline stage reads from and writes to a single shared
[Intermediate Representation](./intermediate-representation.md) (IR). No stage invents its own
private data model for the article; no stage talks to another stage's internals directly. A stage's
contract is entirely described by what it reads from and writes to the IR.

This matters because it makes each stage's job independently understandable: to know what
Link Resolution does, it's enough to know it reads `ir.links`/`ir.categories` and writes
`resolvedTarget` (plus the corresponding DOM `href`s) — nothing else in the system needs to be
understood first.

## 3. Parsoid is the only Wikitext parser Perseus is allowed to have

Wikitext has no formal grammar of its own; MediaWiki's own historical parser is famously irregular.
Perseus does not attempt to parse Wikitext itself, anywhere, for any reason. Every Wikitext-to-HTML
and HTML-to-Wikitext conversion goes through the real Parsoid service (via the MediaWiki REST API's
stateless transform endpoints — see [Parsing & Parsoid Integration](./parsing-and-parsoid.md)).

The two narrow exceptions — `templateWikitextTokens.ts` recognizing `[[...]]`/`{{...}}`/`<ref>`/HTML
comments, and `templateParameters.ts` splitting an already-isolated `{{...}}` call string — are not
counterexamples to this rule. Both operate only on a wikitext STRING that Parsoid has already isolated
for Perseus (a template parameter's own `data-mw` value), never on a raw article's Wikitext as a
whole, and neither is a general-purpose parser (see [Template Handling](./template-handling.md)).

## 4. A citation, once captured, is never re-derived from the DOM

The Citation Handling Redesign established a rule that still holds: once a citation's HTML has been
captured into the `CitationRegistry` at parse time, nothing downstream is allowed to reconstruct or
re-derive it by reading the DOM again. The registry's snapshot is authoritative; a live DOM read is
used only to detect and warn about drift, never trusted over the snapshot. See
[Citation Handling](./citation-handling.md).

## 5. A template is opaque by default; specific parameters can be opted in

Perseus does not assume all templates should be translated, and does not assume all templates should
be opaque. The default is opaque — a template transclusion's rendered HTML is not what Parsoid
serializes back to Wikitext (template expansion is not invertible), so touching it would either do
nothing or corrupt the output. A small, explicit allow-list of templates
(`{{Blockquote}}`, `{{Infobox ...}}`, `{{efn}}`, and a few others) opts specific parameters into the
ordinary Extract → Chunk → Translate → Merge path by exposing them as IR text nodes backed by a
`data-mw`-writing closure instead of a DOM-writing one. See
[Template Handling](./template-handling.md).

## 6. Content that isn't article prose never reaches translation

An HTML comment, a citation's own bibliographic markup, a template's structural syntax, a bare
URL written with no separate label — none of this is content a translator (human or machine) should
ever see. Each case is filtered out at the layer that first has enough context to recognize it, not
patched over later in generation. See [Comment Handling](./comment-handling.md) and
[Template Handling](./template-handling.md) for the two most significant instances of this rule.

## 7. Resolution decides; generation represents

Deciding _whether_ a link has a target-wiki equivalent, and deciding _how that decision gets written
into the final Wikitext_, are two separate concerns handled by two separate stages. Link Resolution
(stage `03-link-resolution`) only ever decides the semantic outcome — a resolved title, or `null`. It
never constructs literal Wikitext syntax. Constructing the actual output representation — a resolved
`<a href>`, an unresolved link left as-is, or an interwiki-fallback template call — is entirely the
job of Wikitext Generation (and, for template-parameter links, template reconstruction at merge time).
See [Link Resolution](./link-resolution.md) for why this separation matters in practice, including the
concrete bug it would have prevented.

## 8. A representation Perseus itself introduces must still look like something Parsoid produced

When Perseus needs to introduce new structure into the article that wasn't there in the original
Wikitext — the clearest example being an interwiki-fallback template call for a link with no
target-wiki equivalent — that structure must be expressed the way Parsoid itself would express it: a
real transclusion element (`typeof="mw:Transclusion"` plus a `data-mw` attribute), never a plain DOM
text node containing literal `{{...}}` characters. A text node is, by definition, already-rendered
prose in the Parsoid HTML model; Parsoid's own serializer correctly treats literal template-call
syntax sitting in a text node as something that must be escaped (with `<nowiki>`) to avoid being
misread on re-parsing. This is documented in detail, with the concrete failure it once caused, in
[Parsing & Parsoid Integration](./parsing-and-parsoid.md#lesson-a-new-transclusion-must-be-a-real-transclusion-node).

## 9. Determinism is what makes a saved session resumable

A [Translation Session](./translation-session.md) does not persist the article's content — only a
revision reference and a record of which text nodes were translated to what. Resuming a session means
re-fetching that exact revision and re-parsing it from scratch. For the saved chunk-to-node mapping to
still line up, parsing the same HTML must always produce the same node ids, in the same order, with no
dependency on anything outside the HTML string itself (see
`buildIRFromParsoidHtml` in [parsing-and-parsoid.md](./parsing-and-parsoid.md)). Determinism here is
not an optimization; it is what makes "save and resume" possible at all.

## 10. Every translator is interchangeable at the pipeline's boundary

The pipeline depends on a single `Translator` interface (`translateChunk`/`translate`), never on a
concrete provider. A human editing chunks by hand, an LLM behind a generic chat-completion API, or
Wikimedia's own whole-revision translation backend are all, from the pipeline's point of view, the
same shape: something that turns a `Chunk` into a `TranslatedChunk`. This is what lets a new provider
be added, or a session be resumed under a different provider than it was started with, without any
change to Chunking, Merge, or the pipeline orchestrator itself. See
[LLM Providers](./llm-providers.md).
