> Was a sentence unclear? Instead of ignoring it, make a simple 'edit' and leave your name in the
> history of this page's improvement.

# Translation Session

A Translation Session is the on-disk, JSON-serializable representation of a translation in progress —
what makes "save now, resume later" possible (Architectural Principle 1 and 9). This document covers
the format, how it is produced and consumed, and the assumption its resumability actually rests on.

## What a session persists, and what it does not

A session does NOT persist the article's content, its parsed structure, or link-resolution results.
It persists:

- A reference to the exact source revision (so resuming re-fetches the SAME immutable Parsoid HTML —
  see [pipeline.md](./pipeline.md#two-entry-points-one-shared-tail)).
- The chunk grouping a human already saw (`SessionChunk[]`), so resuming doesn't re-chunk and
  potentially shuffle boundaries the human has already worked around.
- Which text nodes have been translated to what (`TranslationEntryTuple[]`).

## Format versioning

`translation-sessions/types.ts` defines exactly ONE supported format — there is no version-negotiation
mechanism, no migration path between format revisions. `validateTranslationSession` rejects anything
that doesn't match the current shape outright rather than attempting to interpret an older or
unrecognized format.

## Export

`exportTranslationSession` (`export.ts`) snapshots the current in-memory session state into the
serializable `TranslationSession` shape. `EXTERNAL_TRANSLATION_INSTRUCTIONS` is bundled alongside the
export — guidance meant for a human translator working from the exported chunk text directly (outside
Perseus entirely), covering the same placeholder-token rules documented in
[Chunking & Translation](./chunking-and-translation.md#what-a-translator-is-allowed-to-do-and-what-must-remain-untouched).

## Resuming: `applySessionChunk` and the diff-based merge

`import.ts`'s `applySessionChunk` reconstructs `TranslatedUnit[]` by DIFFING each saved
`SessionChunk.translation` tuple's text against the FRESHLY re-parsed node's ORIGINAL text: if they're
identical, the node hasn't been translated yet (no-op, skip); otherwise, the saved text is treated as a
translation to merge. This avoids storing both "original" and "translated" text separately for every
node — "was this translated" is re-derived from a live comparison instead.

This diff approach has a real, non-obvious dependency: it assumes re-parsing the SAME revision always
produces byte-identical original text for a given node id. `buildIRFromParsoidHtml`'s determinism
guarantee (Architectural Principle 9) makes this true AS LONG AS Parsoid itself returns byte-identical
HTML for the same revision across two separate calls, potentially days or weeks apart. This is an
assumption about an external, unversioned service Perseus has no way to verify or protect itself
against. If Parsoid's own rendering ever changed for reasons unrelated to the underlying Wikitext (a
Parsoid software upgrade, for instance), old saved sessions could misapply certain chunks, or ids could
shift if the number of extracted nodes changed. This is a low-probability, long-term risk inherent to
the "don't persist article content" design, not a bug — worth knowing about, not something to be fixed
by this documentation pass.

## Link resolution is re-run on every resume, deliberately

Nothing about a link's resolved target-wiki title is persisted in a session. `reconstructFromRevision`
re-runs Link Resolution unconditionally on every resume — see
[pipeline.md](./pipeline.md#two-entry-points-one-shared-tail) and
[Link Resolution](./link-resolution.md). This means a link's resolution outcome CAN legitimately
change between when a session was started and when it's resumed, if Wikidata's own sitelinks changed
in the interim — this is expected, not a defect: Perseus queries live, editable Wikidata data, and a
session's job is to be correct against the CURRENT state of that data, not to freeze a decision made
at an earlier point in time.

## Progress and validation

`calculateSessionProgress` (`progress.ts`) reports how many of a session's known text nodes have a
non-empty, changed translation, purely by counting — it does not re-run any part of the pipeline.
`validateTranslationSession` (`validate.ts`) checks a session's shape (required fields present, chunk
references consistent, format version recognized) before Perseus will attempt to resume it — a session
that fails validation is rejected outright rather than partially loaded.
