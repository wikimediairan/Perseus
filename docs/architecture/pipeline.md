> Was a sentence unclear? Instead of ignoring it, make a simple 'edit' and leave your name in the
> history of this page's improvement.

# Pipeline

The pipeline is the fixed sequence of stages an article moves through, from a URL to generated
target-language Wikitext. `pipeline/Pipeline.ts` is intentionally "dumb": it holds no business logic
of its own, only ordered calls into stage implementations it receives by interface
(`PipelineDependencies`), plus logging. All real behavior lives in the stage classes — see
[pipeline-stages.md](./pipeline-stages.md) for what each one actually does.

```text
01-input               load-article
02-parsing              parse-with-parsoid
03-link-resolution       resolve-wikidata-links
04-extraction             extract-translatable-nodes
05-chunking                chunking
06-translation               translation
07-merge                       merge
08-reference-attention           (not a named pipeline stage — see below)
09-generation                      generate-wikitext
```

`pipeline/PipelineStage.ts` defines the canonical, ordered list of NAMED stages:

```ts
export const PIPELINE_STAGE_ORDER = [
  "load-article",
  "parse-with-parsoid",
  "resolve-wikidata-links",
  "extract-translatable-nodes",
  "chunking",
  "translation",
  "merge",
  "generate-wikitext",
] as const;
```

Notice `08-reference-attention` is not in this list. It is a real stage — `Pipeline` exposes a method
for it and it runs during a normal session — but it does not gate progression to any later stage, and
its own numbering (`08-`) sits between Merge and Generation only because that is when it happens to
run in practice. See [pipeline-stages.md](./pipeline-stages.md#8-reference-attention-not-a-numbered-stage)
for what it currently does and does not do.

## Two entry points, one shared tail

`Pipeline` exposes two ways to reach a translatable article, both converging on the same
`ExtractionResult { ir, worklist, source, targetWiki }`:

- **`runToExtraction(source)`** — a brand-new session against the CURRENT revision of a live article.
  Fetches Wikitext by title (`load-article`), then runs Parse → Link Resolution → Extraction.
- **`reconstructFromRevision(source, targetWiki)`** — resumes a saved
  [Translation Session](./translation-session.md) against an IMMUTABLE revision id. Runs the exact
  same Parse → Link Resolution → Extraction sequence as a fresh session, just fetching Parsoid HTML by
  revision id instead of by title.

Both paths run Link Resolution unconditionally, including on resume — nothing about a link's
target-wiki equivalent is cached across a save/resume cycle (see
[Link Resolution](./link-resolution.md) and [Translation Session](./translation-session.md) for what
this implies about resumed sessions).

From the shared `ExtractionResult`, the pipeline's remaining primitives can be driven independently,
in any order, by either entry point:

- **`deriveChunks(worklist)`** — called once per brand-new session. A resumed session instead reuses
  its PERSISTED `Chunk[]` (stored as `SessionChunk[]` in the session file) so the grouping a human
  already saw or edited stays stable across the save/resume boundary.
- **`translateChunk(chunk, targetWiki)` / `mergeChunk(ir, translatedChunk)`** — the two chunk-level
  primitives that actually move a chunk from source text to merged, translated DOM.
- **`classifyReferenceAttention(ir)`** — runs the Reference Attention classifier (see
  [pipeline-stages.md](./pipeline-stages.md#8-reference-attention-not-a-numbered-stage)).
- **`generateWikitext(ir, targetWiki)`** — the final step; produces the Wikitext string the human
  contributor will review and publish.

## What can mutate the IR, and where

Only four call sites in the whole codebase mutate `ir.structure` (the DOM-backed part of the IR) or
the DOM it wraps:

1. **Parser** (`ParsoidParser.ts`) — creates the IR and its backing DOM.
2. **Link Resolver** (`WikidataLinkResolver.ts`) — rewrites `<a href>`/`<link href>` in place once a
   link or category resolves to a target-wiki title.
3. **Merger** (`Merger.ts`, plus the `data-mw`-writing closures from `templateParameters.ts` it calls
   into) — writes translated text into the live DOM.
4. **Wikitext Generator** (`WikitextGenerator.ts`) — removes target-wiki-denylisted templates and
   rewrites unresolved links into interwiki-fallback template calls, both immediately before
   serialization.

Every other stage (Extraction, Chunking, Translation) only ever sees the flat, DOM-free views
(`textNodes`, `links`, `categories`) — see [Intermediate Representation](./intermediate-representation.md)
for the full shape.

## Failure model

Every stage that can fail throws a `PerseusError` tagged with a category (`InputError`,
`ParsingError`, `LinkResolutionError`, `TranslationError`, `ChunkIdentityError`, `MergeError`,
`GenerationError`, ...) and, for network-calling stages, a `context.retryable` flag a caller can use
to decide whether to offer a retry. Failure is NOT uniformly non-fatal across the pipeline — this is
worth being explicit about, since it is easy to assume otherwise:

- A single link or category failing to resolve (no Wikidata entity found) is a normal, expected
  outcome (`resolvedTarget: null`), not an error.
- A REDIRECT lookup failing (MediaWiki unreachable, malformed response) is deliberately non-fatal — it
  degrades to treating the title as non-redirected and continues (see
  [Link Resolution](./link-resolution.md)).
- Wikidata itself being unreachable, or returning a non-2xx / unparsable response, IS a hard failure
  for the whole `resolve-wikidata-links` stage — the pipeline run stops rather than silently resolving
  every link to "no equivalent". This distinction (connectivity failure vs. a genuine negative result)
  is treated as important enough to be enforced, not just documented.
- Extraction and Chunking are pure, in-memory transformations over already-validated data and cannot
  fail.
