> Was a sentence unclear? Instead of ignoring it, make a simple 'edit' and leave your name in the
> history of this page's improvement.

# Citation Handling

Citations are the one subsystem in Perseus that is deliberately, entirely opaque to translation. This
document explains the data model and the trust rule that governs it (Architectural Principle 4).

## What Perseus does and does not do with a citation

Perseus preserves citation STRUCTURE — which references share a name, which is the defining
occurrence, group membership — without altering citation CONTENT. A citation's own bibliographic
markup is never translated, and Perseus never converts between citation styles (`sfn`, `harv`,
`cite`-template, plain text, or anything else a source article might use).

## `<ref>` in Parsoid HTML

`<ref>...</ref>` (a defining occurrence) and `<ref name="x"/>` (a reuse of an existing name) both
become elements whose `typeof` starts with `mw:Extension/ref`. The rendered reference list
(`{{reflist}}` / `<references/>`) becomes `mw:Extension/references` — the SAME prefix match
(`typeof.startsWith("mw:Extension/ref")`) deliberately covers both an individual marker and the
rendered list with one check.

A citation's VISIBLE call-site content is almost always just an auto-numbered `[1]` — the actual
bibliographic content lives in `data-mw.body.html`, which is why classification and registry-building
read `body.html`, not the element's own child DOM.

## `CitationRegistry`

```ts
type CitationId = string; // "cite-1", "cite-2", ...
type CitationStyle = "sfn" | "harv" | "unknown" | "plain-text" | "cite-template";

interface CitationDefinition {
  id: CitationId;
  name: null | string;
  group: null | string;
  style: CitationStyle;
  dir: null | "ltr" | "rtl";
  element: null | Element;
  snapshotHtml: string;
  referencedBy: CitationId[];
  translatableParameters: CitationParameterRef[]; // currently always empty
}

interface CitationReference {
  id: CitationId;
  name: null | string;
  group: null | string;
  isDefining: boolean;
  definitionId: null | CitationId;
  element: null | Element;
  snapshotHtml: string;
}
```

`translatableParameters` is a reserved, currently unpopulated field — nothing in the pipeline sets it.
This means citation body text (an author name, a title inside a `{{cite web}}` call) is not translated
today, even though the data model has a stub for eventually doing so via the ordinary
Extract/Translate/Merge path.

## The rule: a snapshot, once taken, is authoritative — never re-derived

`getReferenceHtml` / `getDefinitionHtml` always return `snapshotHtml`, captured once at parse time,
NEVER a live re-read of `element.outerHTML`. If a live element is passed in for comparison and its
current content disagrees with the snapshot, the SNAPSHOT wins, and a `html-drift` warning is logged.
This is a deliberate trust boundary: nothing downstream of parsing is trusted to have kept a citation's
DOM representation faithful, so the registry protects citations from any accidental mutation elsewhere
in the pipeline by simply never looking at the live DOM for their content again.

## Building the registry: two passes, and why

`buildCitationRegistry` runs in two passes specifically to avoid a document-order dependency. A bare
reuse (`<ref name="x"/>`) can legitimately appear BEFORE its defining occurrence
(`<ref name="x">body</ref>`) in document order — MediaWiki's Cite extension does not require
definition-before-use. Pass one registers every DEFINING occurrence (has a `body`) as both a
`CitationDefinition` and its own `CitationReference` (a defining `<ref>` is also a call site itself).
Pass two registers every non-defining occurrence, resolved by name against pass one's definitions.
Collapsing this into a single pass would make "missing definition" detection dependent on DOM order —
a subtle regression this two-pass structure exists specifically to avoid.

## Diagnostics

`CitationRegistry.warnings` is the one structured diagnostic channel for this subsystem, covering six
kinds: `html-drift`, `orphan-definition`, `malformed-reference`, `duplicate-definition`,
`unsupported-structure`, `missing-named-definition`. `flushWarningsTo(logger)` is idempotent (tracks
how many warnings it has already logged), so it can safely be called from more than one point in the
pipeline's lifetime without duplicating log output.

## Interaction with the rest of the pipeline

Because citation content is fully opaque, no other stage needs to know anything about citation
internals beyond recognizing a citation MARKER as something to exclude from translatable text (see
[Parsing & Parsoid Integration](./parsing-and-parsoid.md#the-placeholder-protocol) — a citation marker
is a solo placeholder, resolved via the registry, never recursed into) and never re-deriving its
content from a live DOM read.
