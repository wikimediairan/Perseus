> Was a sentence unclear? Instead of ignoring it, make a simple 'edit' and leave your name in the
> history of this page's improvement.

# Parsing & Parsoid Integration

Perseus never parses Wikitext itself (Architectural Principle 3). This document explains how it uses
Parsoid instead — what representation enters the system, how Perseus reads it, how DOM mutations are
performed, and how Wikitext is produced again at the end.

## Wikitext vs. Parsoid HTML

Wikitext is Wikipedia's markup language, with no formal grammar of its own. Parsoid is a separate
service that converts Wikitext to and from a specific, round-trip-safe HTML dialect ("Parsoid HTML" —
RDFa-annotated HTML designed so that unchanged content serializes back byte-for-byte, and changed
content serializes to clean, idiomatic Wikitext). Perseus talks to the real Parsoid service through
the MediaWiki REST API's stateless transform endpoints, never through a local reimplementation:

```text
POST /api/rest_v1/transform/wikitext/to/html/{title}   Wikitext -> HTML  (fetchParsoidHtml)
GET  /w/rest.php/v1/revision/{id}/html                  Wikitext -> HTML, by immutable revision (fetchRevisionHtml)
POST /api/rest_v1/transform/html/to/wikitext/{title}    HTML -> Wikitext  (WikitextGenerator)
```

Whether Parsoid's HTML-to-Wikitext transform is lossless for arbitrary HTML shapes is not something
Perseus verifies or controls — it is trusted from Parsoid's own serializer. This is worth stating
plainly rather than assuming: Perseus's correctness for anything it doesn't explicitly handle rests on
Parsoid's guarantees, which should be checked against current MediaWiki/Parsoid documentation if ever
in doubt, not re-derived from this codebase.

## How Perseus reads Parsoid HTML

A handful of Parsoid-specific conventions are what `ParsoidParser.ts` and its helpers actually key off
of:

- **`typeof` attributes** mark anything Parsoid can't render as plain HTML: `mw:WikiLink` (internal
  link), `mw:ExtLink` (external link), `mw:Extension/ref` / `mw:Extension/references` (a citation
  marker or the rendered reference list — the prefix match deliberately covers both with one check),
  `mw:Transclusion` (a template call), `mw:PageProp/Category` (a category, represented as a `<link>`
  element rather than a body `<a>`, typically hoisted out of normal reading-flow position regardless
  of where in the Wikitext it was written).
- **`data-mw`** carries the original wikitext-level data needed to regenerate an opaque construct — a
  template's own name and parameter wikitext (`parts[].template.target.wt` / `.params[name].wt`), or a
  citation's rendered footnote HTML (`attrs.name`/`attrs.group`/`body.html`). See
  [Template Handling](./template-handling.md) and [Citation Handling](./citation-handling.md).
- **`href`** on an internal link is `./` + percent-encoded title, spaces as underscores (e.g.
  `./Ada_Lovelace`). Perseus decodes this but does NOT convert underscores to spaces at extraction
  time — that normalization happens later, only where a title is used as a lookup key (see
  [Link Resolution](./link-resolution.md)).

Perseus makes no attempt to distinguish redirects from canonical titles at the parsing layer — Parsoid
does not resolve redirects when converting Wikitext to HTML, so a link's `href` reflects whatever title
was literally written in the source. See [Link Resolution](./link-resolution.md#redirects) for how
this is handled downstream.

## The placeholder protocol

A translatable block's text routinely contains inline markup that must survive translation (a link's
label, emphasis, a citation marker's position) without the LLM ever seeing raw HTML. `placeholders.ts`
resolves this by flattening a block to plain text while marking inline-element boundaries with
lightweight numeric tokens:

```text
⟪1⟫ opens placeholder 1        ⟪/1⟫ closes placeholder 1        ⟪*1⟫ solo placeholder 1
```

| Content                                             | Treatment                                                                                     |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `<a>`, `<b>`, `<i>`, `<em>`, `<strong>`, `<span>`, ...  | Wrapping placeholder — tag preserved, inner text still translated                              |
| Citation marker                                          | Solo placeholder — resolved via `CitationRegistry`, never recursed into                          |
| HTML comment                                                | Solo placeholder — captured once, preserved verbatim, never sent to translation (see [Comment Handling](./comment-handling.md)) |
| Bare external link (label equals href)                        | Solo/verbatim placeholder — the whole `<a>` round-trips via a live `outerHTML` read, LLM never sees it |
| Template transclusion                                            | Invisible — skipped entirely, not even a placeholder; handled separately if allow-listed (see [Template Handling](./template-handling.md)) |
| Any other inline tag                                                | Dropped — both tag and text content discarded from the flattened output               |

`PlaceholderSpan.element` is a LIVE reference, re-read at reconstruction time rather than a snapshot.
This is deliberate: Link Resolution mutates an `<a>`'s `href` AFTER parsing but BEFORE merge, and that
mutation has to survive into the final HTML. If placeholders captured attributes at flatten time, a
resolved link's target-wiki `href` would never make it into the reconstructed article.

A missing or duplicated token in translated text degrades gracefully rather than corrupting output —
see [Chunking & Translation](./chunking-and-translation.md) for the validation layer that catches this
before it reaches reconstruction, and for which translation paths that validation does and does not
currently cover.

## DOM mutations

Only four call sites in the whole codebase mutate the IR's DOM — see
[pipeline.md](./pipeline.md#what-can-mutate-the-ir-and-where) for the full list and reasoning. This
matters for parsing specifically because it's what parsing HANDS OFF: everything downstream trusts
that the DOM it receives is exactly what Parsoid produced, mutated only through those four known
points.

## Wikitext generation

`WikitextGenerator.ts` reads `root.innerHTML` from the (by then translated, merged) DOM and posts it
to Parsoid's HTML-to-Wikitext transform. Two DOM mutations happen immediately before that read — see
[pipeline-stages.md](./pipeline-stages.md#9-09-generation--generate-wikitext-wikitextgeneratorts).

## Lesson: a new transclusion must be a real transclusion node

This is documented as an architectural constraint, not an implementation anecdote, because it was
learned from a real, shipped bug.

An earlier version of the interwiki-fallback feature (see
[Link Resolution](./link-resolution.md#the-interwiki-fallback)) replaced an unresolved link's `<a>`
element with a plain DOM TEXT NODE containing the literal string `{{پم|فارسی|Persian}}`, on the
assumption that Parsoid's HTML-to-Wikitext transform would reproduce it byte-for-byte as a real
template call. It does not: a DOM text node represents literal, already-rendered prose in the Parsoid
HTML model, not wikitext source to be (re-)executed. When a text node's content would, if emitted
as-is, be reinterpreted by MediaWiki's wikitext parser as something other than plain text — a leading
`{{` looks like a template invocation — Parsoid's serializer escapes it, specifically so that an
ordinary paragraph that happens to literally MENTION `{{example}}` in prose does not turn into a live
transclusion on serialization. The escape mechanism for this case is `<nowiki>...</nowiki>`. The
result was `<nowiki>{{پم|فارسی|Persian}}</nowiki>` in the generated Wikitext — a broken, inert template
call — instead of a working one.

The fix, and the constraint this section documents: any template invocation Perseus itself needs to
introduce must be represented as a real Parsoid transclusion element — `typeof="mw:Transclusion"` plus
a structured `data-mw` attribute — exactly like every other template already on the page, never as
literal `{{...}}` text sitting in ordinary DOM content. Since Parsoid's serializer regenerates
`{{...}}` call syntax FROM `data-mw`, never from an element's rendered content, the wrapper element's
own inner HTML is irrelevant and can be left empty. See `interwikiFallback.ts`'s
`buildInterwikiTemplateElement` for the current implementation of this rule.

One consequence worth calling out explicitly: because Parsoid's serializer — not Perseus — is
responsible for regenerating the call syntax from structured `data-mw` values, Perseus does not need to
escape special wikitext characters (a literal `|` or `=`) in a label or title it places into a NEW
transclusion's `data-mw`. That escaping is Parsoid's job, the same way it already is for every
pre-existing template on the page. This is different from the template-PARAMETER case (see
[Template Handling](./template-handling.md)), where Perseus IS responsible for producing valid raw
Wikitext text itself, because that text is embedded directly into an EXISTING template's own parameter
value rather than being regenerated by Parsoid from structured data.
