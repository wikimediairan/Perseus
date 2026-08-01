> Was a sentence unclear? Instead of ignoring it, make a simple 'edit' and leave your name in the
> history of this page's improvement.

# Pipeline

The pipeline is the sequence a source article moves through on its way to generated Wikitext. It
exists to give every stage of translation a fixed place in a fixed order, so that "what happens
before X" and "what X can assume already exists" are always answerable without reading the stage's
own logic.

## Stages

```mermaid
flowchart TB
    A[Load Wikitext]
    B[Parse with Parsoid]
    C[Analyze Wikidata Links]
    D[Extract Content]
    E[Chunk Content]
    F[Translate]
    G[Merge]
    H[Generate Wikitext]

    A --> B --> C --> D --> E --> F --> G --> H
```

- **Load Wikitext** — retrieves the source article, from a live Wikipedia URL or a local file.
- **Parse with Parsoid** — builds the
  [Intermediate Representation](./intermediate-representation.md) from the article's HTML, and
  registers citation structure into it (see [Citation Handling](./citation-handling.md)).
- **Analyze Wikidata Links** — resolves the IR's links against the configured
  [Target Wiki](./target-wiki.md), so translated output points at the correct destination articles.
- **Extract Content** — selects the IR's translatable content into an ordered worklist, excluding
  anything inside a [protected region](./citation-handling.md#protected-content) such as a citation.
- **Chunk Content** — groups the worklist into [chunks](./chunking-and-translation.md), the unit
  translation always operates on.
- **Translate** — produces translated text for a chunk, by whichever
  [executor](./chunking-and-translation.md#executors) the user chooses.
- **Merge** — writes a chunk's translated text back into the Intermediate Representation.
- **Generate Wikitext** — serializes the fully-merged IR back into Wikitext.

## Two phases, two different execution models

The first five stages — Load through Chunk — always run together, automatically, as one synchronous
pass with no user decision point in the middle. The last three — Translate, Merge, Generate — do
not.

```mermaid
flowchart LR
    subgraph Automatic["Automatic phase"]
        direction LR
        A2[Load] --> B2[Parse] --> C2[Analyze Links] --> D2[Extract] --> E2[Chunk]
    end
    subgraph Interactive["Interactive phase"]
        direction LR
        F2[Translate] --> G2[Merge] --> H2[Generate]
    end
    Automatic --> Interactive
```

This split exists because translation, unlike loading and chunking, is not a single deterministic
transformation — it can be carried out by different executors, interrupted, resumed, and repeated
per chunk (Architectural Principles
[§4–5](./architectural-principles.md#4-translation-always-operates-on-chunks-never-on-a-whole-article-or-a-single-field)).
Merge happens incrementally, once per chunk, as soon as that chunk's translation is available — it
does not wait for every chunk to finish. Generation is the one exception kept explicit and
user-triggered rather than automatic: it is the only stage that costs a live call to an external
Wikitext-serialization service, so the pipeline never performs it as a side effect of merging.

## Two ways to enter the pipeline

An article does not always enter the pipeline through Load. A saved
[Translation Session](./translation-session.md) can instead re-enter starting from Parse, by
re-fetching its exact source revision from Wikipedia directly (via `source.revisionId`) instead of
resolving a URL by title.

```mermaid
flowchart TB
    subgraph Fresh["Fresh article"]
        A3[Load] --> B3[Parse] --> C3[Analyze Links] --> D3[Extract]
    end
    subgraph Resumed["Resumed session"]
        S3["Fetch source.revisionId's HTML"] --> B4[Parse] --> C4[Analyze Links] --> D3
    end
    D3 --> E3[Chunk] --> Chunks[Persisted chunk list]
```

Both paths converge on the same chunk list, which is why nothing downstream of Chunk needs to know
which entry point was used. Note what resuming a session skips and what it doesn't: it skips Load's
title-based article lookup (a session already knows its exact revision), but it still runs Parse
against freshly fetched HTML and still re-runs Analyze Wikidata Links from scratch. An earlier design
cached a post-resolution snapshot and skipped both of those steps on resume; that snapshot is no
longer part of a Translation Session (see [Translation Session](./translation-session.md#why-reconstruction-now-means-re-fetching-not-re-embedding)),
so resuming now costs the same network calls a fresh load does, just anchored to a specific revision
instead of "whatever the article currently is." Chunking is still not repeated — a resumed session
reuses its persisted chunk list verbatim rather than calling Chunk again.

## Non-fatal stages

No stage's failure is fatal to the pipeline as a whole; a stage that encounters an anomaly (an
unresolvable citation reference, an unreachable Wikidata entity) records it rather than aborting.
This follows from Architectural Principle
[§2](./architectural-principles.md#2-perseus-produces-drafts-humans-decide-what-is-true): since a
human always reviews the output, the pipeline's job is to surface problems for that review, not to
pre-emptively decide a translation cannot proceed.
