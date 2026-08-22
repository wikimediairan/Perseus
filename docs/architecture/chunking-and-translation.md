> Was a sentence unclear? Instead of ignoring it, make a simple 'edit' and leave your name in the
> history of this page's improvement.

# Chunking & Translation

This document covers how an article's translatable text becomes translation-sized chunks, and the
single wire protocol shared by every translator — human or automated — that turns a chunk's source
text into translated text without corrupting the placeholder structure inside it.

## Chunking

`Chunker.ts`'s `SizeBoundedChunker` groups the `TranslationWorklist`'s `TranslationUnit[]`
(`{ nodeId, sourceText }`) into `Chunk[]`, bounded by `DEFAULT_MAX_CHUNK_CHARS` (2500 characters),
greedily: accumulate units into the current chunk, flush whenever the next unit would exceed the
budget AND the current chunk is non-empty. A single unit longer than the budget still gets its own,
over-budget chunk rather than being split across two chunks or dropped — chunking never splits a unit.

A `Chunk` is just an id plus its `TranslationUnit[]` — there is no separate "rendered wire text"
artifact stored anywhere. The text actually sent for translation is generated on demand by
`renderChunkForTranslation`.

## The segment protocol

Every chunk is rendered to one string with a fixed structure:

```text
[[PERSEUS CHUNK chunk-3 a1b2c3d4]]
[[SEGMENT 1]]
The ⟪1⟫Sun⟪/1⟫ is a ⟪2⟫star⟪/2⟫.
[[SEGMENT 2]]
It has a companion. ⟪*1⟫
```

- **`[[PERSEUS CHUNK <id> <fingerprint>]]`** — identifies the chunk and its expected content.
  `computeChunkFingerprint` is an FNV-1a hash over the chunk id plus every unit's node id and source
  text. Its entire purpose is to detect the "wrong text pasted back" failure mode: a human translator
  copying a DIFFERENT chunk's response into this chunk's slot. A fingerprint mismatch is a hard,
  non-retryable failure (`ChunkIdentityError`) — there is no sensible way to partially recover from
  translated text that doesn't correspond to the chunk it claims to.
- **`[[SEGMENT n]]`** — separates each unit's text within the chunk. `n` corresponds to the unit's
  position in the chunk, not to any external id.
- **`⟪n⟫` / `⟪/n⟫` / `⟪*n⟫`** — the placeholder tokens described in
  [Parsing & Parsoid Integration](./parsing-and-parsoid.md#the-placeholder-protocol): open, close, and
  solo forms. `n` is unique only WITHIN the text node the placeholder originated from, never globally.

## What a translator is allowed to do, and what must remain untouched

A translator is explicitly allowed to:

- Translate all plain text.
- REORDER tokens relative to each other, to match target-language grammar (a wrapped phrase can
  legitimately move to a different position in a translated sentence).

A translator must NOT:

- Delete, duplicate, split, or merge a token.
- Change a token's digits, or substitute a look-alike character for them (`tokenSignatures`'s matching
  regex uses plain ASCII `\d` specifically to reject Persian/Arabic-Indic digit look-alikes, which
  would otherwise be silently treated as ordinary translated text rather than a corrupted token).
- Reorder a given id's OWN open token relative to its OWN close token — `markersMatch` enforces
  per-id open-before-close ordering, but deliberately allows any relative ordering BETWEEN different
  ids, since natural translation legitimately reorders clauses.
- Move a `[[PERSEUS CHUNK ...]]` / `[[SEGMENT ...]]` marker, or alter a chunk's identity.

## How merge reconstructs the original structure

`parseChunkTranslation(chunk, responseText)`:

1. Verifies the chunk id and fingerprint match what was sent (`ChunkIdentityError` if not).
2. Splits the response on `[[SEGMENT n]]` boundaries, back into per-unit text.
3. For each unit, runs `markersMatch(sourceText, translatedText)` — checking the SET of tokens present
   matches exactly (same ids, same shapes, same counts, so duplication is caught, not just presence)
   and that each id's own ordering constraint holds.
4. A unit that fails `markersMatch` is reported as missing/invalid rather than merged as-is —
   `Translator.ts` retries a single dropped unit once before giving up on it.

Only a unit that has passed this validation becomes a `TranslatedUnit` that `Merger.merge` will act on
— see [pipeline-stages.md](./pipeline-stages.md#7-07-merge--merge-mergerts) for what Merge itself does
with it (`reconstructHtmlFromPlaceholders` for ordinary text nodes, or the registered writer closure
for template-parameter nodes).

### An important gap in this guarantee

This validation is enforced by the `LLMTranslator` executor's own call into `segmentProtocol.ts` before
it ever constructs a `TranslatedChunk`. It is NOT enforced uniformly across every path that can reach
`Merger.merge` — the Wikimedia provider's own translator (`WikimediaTranslator`, see
[LLM Providers](./llm-providers.md#the-wikimedia-provider)) and a resumed
[Translation Session](./translation-session.md)'s `applySessionChunk` path both construct
`TranslatedUnit[]` without running `markersMatch` first. This is a fact about current behavior, not
something this documentation pass changed or fixed.
