> Was a sentence unclear? Instead of ignoring it, make a simple 'edit' and leave your name in the
> history of this page's improvement.

# Template Handling

Perseus does not assume all templates should be translated, and does not assume all templates should
be opaque (Architectural Principle 5). This document explains the actual rule, and how it is
implemented.

## Why a template transclusion is opaque by default

A template transclusion (`{{Template|params}}`) is represented in Parsoid HTML as an element with
`typeof="mw:Transclusion"` and a `data-mw` attribute holding the ORIGINAL wikitext for the call —
`parts[].template.target.wt` (the template name as written) and `.params[name].wt` (each parameter's
raw wikitext value). Template expansion is not invertible: Parsoid's HTML-to-Wikitext serializer
always regenerates `{{Template|params}}` fresh from `data-mw`, NEVER from whatever rendered HTML
happens to be sitting inside the transclusion element in the DOM. This means touching a transclusion's
rendered content would do nothing to the final Wikitext at best, and corrupt the relationship between
`data-mw` and the DOM at worst.

Because of this, the ordinary block-level extraction pass in `ParsoidParser.ts`
(`isInsideProtectedRegion`) explicitly skips anything inside a `mw:Transclusion` element — a
template's content is invisible to it entirely, not even represented as a placeholder.

## The allow-list: specific parameters of specific templates

`templateParameters.ts` is a second, separate extraction pass that operates directly on `data-mw`
strings rather than the DOM, specifically because that DOM content isn't reachable through the
ordinary path described above. `isAllowedTopLevelTemplateName` is the actual current rule — a fixed
set of template names (matched case/underscore-insensitively) whose parameters are eligible to become
translatable `TextNode`s:

```text
blockquote, cquote, quote box, quote, infobox*, short description, about, multiple image, efn, cslist
```

(`infobox*` matches any template name starting with `infobox `, e.g. `Infobox person`,
`Infobox company`, since an infobox is not a distinct Parsoid concept — it is simply a template whose
rendered form happens to be a table.)

For an allow-listed template, `isProtectedParameterName` decides which of ITS parameters are actually
translatable — a name-based denylist (`url`, `website`, `coordinates`, `align`, `width`, `date`,
`name`, `group`, and a handful of others, plus pattern rules like `/url$/i` and
`/^(image|logo|flag|map)\d*(_.*)?$/`), plus one narrow position-based special case for `{{about}}`
(odd positional indices from position 3 onward are page titles, not prose — handled by explicit
position, not a growing set of per-template special cases). Everything not denylisted is translatable
by default.

## What this looks like for `{{Blockquote}}` and `{{efn}}`

Per [Template:Blockquote](https://en.wikipedia.org/wiki/Template:Blockquote) and
[Template:Efn](https://en.wikipedia.org/wiki/Template:Efn), both are formatting containers, not
protected/opaque templates — their textual content is article content and belongs in translation. This
is already the current, working behavior, for both parameter styles either template supports:

```wikitext
{{Blockquote
|text=Some English quotation here
|author=Author Name
}}
```

```wikitext
{{Blockquote|Some English quotation here}}
```

Both `text`/`author` (named) and the positional `1` form extract as translatable `TextNode`s — neither
`text`/`author` nor the bare positional key is on the protected-parameter denylist. The same applies to
`{{efn|Some English explanatory note}}` and `{{efn|text=Some English explanatory note}}`; `efn`'s
`name=` parameter (a cross-reference identifier, not prose) IS denylisted and stays untranslated.

The template's own NAME and its parameter KEYS are never touched — only the `wt` VALUE of an eligible
parameter changes. This is enforced structurally, not by convention: the extraction/reconstruction
machinery described below only ever rewrites a parameter's value string, never the surrounding
`data-mw` shape.

## How a parameter's text becomes a `TextNode`, and how it comes back

`extractTemplateParameterUnits` walks every allow-listed transclusion's `data-mw.parts[].template.params`,
and for each translatable parameter, tokenizes its raw wikitext value (`templateWikitextTokens.ts`'s
`tokenizeWikitextValue`) into plain translatable text plus a table of protected spans — the SAME
general approach `placeholders.ts` uses for ordinary DOM content, deliberately reused rather than
reinvented (Architectural Principle 3's narrow, isolated-string exceptions). A parameter value can
contain:

- `[[target|label]]` wikilinks — the label is translatable; the target is resolved against Wikidata in
  the same batch as ordinary body links (see [Link Resolution](./link-resolution.md)) or, if
  unresolved, rendered as an interwiki-fallback template call.
- `<ref>...</ref>` — protected, opaque, preserved verbatim.
- `<!--...-->` HTML comments — protected, opaque, preserved verbatim, never sent to translation (see
  [Comment Handling](./comment-handling.md)).
- `{{...}}` nested template calls — opaque by default. A nested template whose OWN name is on
  `isRecursableTemplateName`'s list (the same allow-list, plus `cslist`) has ITS parameters
  recursively exposed the same way, up to a fixed recursion depth (4 levels); anything else is one
  single opaque unit, preserved verbatim, exactly as authored.

The extracted `TextNode` is registered alongside a WRITER closure in
`ir.structure.templateParamWriters`, not a DOM element — Merge calls this closure with the translated
text instead of writing to `innerHTML` (see [pipeline-stages.md](./pipeline-stages.md#7-07-merge--merge-mergerts)).
The writer re-reads the transclusion's CURRENT `data-mw` (not a cached copy) before rewriting it,
because two different parameters of the same template can each be translated and merged independently
— re-reading and rewriting the whole `params` object each time keeps each commit correct regardless of
what order the parameters are merged in.

## What must NOT happen

- A non-allow-listed template's content must never become a `TextNode` — it remains fully opaque, as
  the default requires.
- The template's own name, and every parameter's KEY, must never change — only an eligible parameter's
  VALUE is ever rewritten.
- A nested, non-recursable template inside an allow-listed parameter must be preserved as a single,
  verbatim unit — never partially translated, never split.
