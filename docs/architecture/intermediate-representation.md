> Was a sentence unclear? Instead of ignoring it, make a simple 'edit' and leave your name in the
> history of this page's improvement.

# Intermediate Representation

The Intermediate Representation (IR) is the one data model every pipeline stage reads from or writes
to (Architectural Principle 2). This document explains what it represents, why it is shaped the way it
is, and which invariants a stage must preserve.

## Design decision: the IR's backbone is a live Parsoid DOM, not a bespoke tree

Rather than inventing a separate node-type hierarchy, `ir.structure.document` IS the live `Document`
produced by parsing Parsoid's own HTML output. Perseus never re-derives article structure itself — it
keeps Parsoid's own structural representation alive for the whole pipeline run and mutates it in
place. This is what "Parsoid is the only parser" (Architectural Principle 3) means in the strongest
sense: there is no second structural model to keep in sync with the first.

`links` / `categories` / `textNodes` are flat, addressable PUBLIC VIEWS over that DOM — the shape every
non-DOM-mutating stage (Extraction, Chunking, Translation) actually interacts with. Only four call
sites in the whole codebase are allowed to mutate `ir.structure` or the DOM it wraps; see
[pipeline.md](./pipeline.md#what-can-mutate-the-ir-and-where).

```ts
interface IntermediateRepresentation {
  sourceTitle: string;
  links: LinkNode[];
  categories: CategoryNode[];
  textNodes: TextNode[];
  citations: CitationRegistry;
  structure: IRStructure;
}
```

## Node types

### `TextNode`

```ts
interface TextNode {
  id: string; // "text-<n>"
  text: string;
}
```

A flat, addressable, translatable span of natural-language text. Before translation, `text` is the
flattened source text with placeholder tokens embedded (see
[Chunking & Translation](./chunking-and-translation.md#the-placeholder-protocol)); Merge overwrites it
in place with the translated text — the same object is updated, never replaced with a new one.

`id`'s numeric suffix is meaningful only for [Translation Session](./translation-session.md)
round-tripping — it has no other significance, and is only unique within its own generating pass (see
below).

**Created by** the block-level loop in `ParsoidParser.ts`, and `templateParameters.ts`'s
`extractTemplateParameterUnits` for allow-listed template parameters (see
[Template Handling](./template-handling.md)) — both share one id counter, threaded through, so ids
stay globally unique across the two sources even though they're generated in two separate passes.

### `LinkNode`

```ts
interface LinkNode {
  id: string;
  originalTarget: string; // always fragment-free
  fragment: string | null; // the stripped #Section, if any — not currently re-attached to anything
  resolvedTarget: null | string;
  label: string;
}
```

Represents one internal wikilink. `originalTarget` is guaranteed fragment-free specifically so
Link Resolution's Wikidata lookup can use it directly as a key — see
[Link Resolution](./link-resolution.md#fragments) for why this matters and what broke before it was
guaranteed.

`resolvedTarget` is written EXACTLY ONCE, by Link Resolution. Nothing else in the pipeline can set it
— translation only ever writes to `TextNode.text`, never to a `LinkNode`, so this invariant is
structurally enforced by which stages have access to which data, not just documented.

### `CategoryNode`

Structurally identical to `LinkNode` minus `label` (a category has no visible label) and `fragment`
(a category page reference cannot carry one). Resolved in the same Wikidata batch as ordinary links.

### `CitationRegistry` / `CitationDefinition` / `CitationReference`

See [Citation Handling](./citation-handling.md) for the full type shapes and the rule that governs
them (a citation's HTML, once captured, is never re-derived from the DOM — Architectural Principle 4).

## `IRStructure` — the DOM-backed half of the IR

```ts
interface IRStructure {
  document: Document;
  nodeElements: Map<string, Element>;
  placeholders: Map<string, PlaceholderSpan[]>;
  linkElements: Map<string, Element>;
  categoryElements: Map<string, Element>;
  templateParamWriters: Map<string, (translatedText: string) => void>;
  templateLinkTargets: string[];
  templateLinkResolutions: Map<string, TemplateLinkResolution>;
}
```

Every map here is a stable id (from `textNodes`/`links`/`categories`) mapped to a live DOM handle or
closure — this is what lets a stage holding only a `TextNode.id` string reach the actual DOM element
when it needs to.

`templateLinkTargets` and `templateLinkResolutions` exist specifically because a wikilink inside a
translatable template parameter has NO DOM `<a>` element to mutate the way an ordinary `LinkNode` does
— a transclusion's rendered DOM is never what gets serialized back to Wikitext. `templateLinkTargets`
is populated at parse time (every raw `[[target|label]]` target found while tokenizing a parameter's
wikitext value); `templateLinkResolutions` starts EMPTY and is populated later, by Link Resolution.
The Map is read LAZILY, BY REFERENCE, at Merge/commit time — the same "live reference, read lazily"
pattern `PlaceholderSpan.element` already uses for ordinary links (see
[Link Resolution](./link-resolution.md) for the full mechanism).

## What information is preserved, and what is deliberately transformed

- **Structure Perseus doesn't touch** (References sections, template internals outside allow-listed
  parameters, citation `data-mw`, non-block-level markup) survives entirely as untouched DOM nodes,
  serialized back to Wikitext by Parsoid's own serializer. Perseus's structural guarantee is really
  "we don't touch it," not "we understand and faithfully reproduce it."
- **Placeholder tokens** are the mechanism by which inline structure (links, emphasis, citation
  markers) survives being flattened to plain text for translation and reconstructed afterward — see
  [Chunking & Translation](./chunking-and-translation.md#the-placeholder-protocol).
- **What must never be lost:** a citation's rendered footnote content (guaranteed by the registry
  snapshot, never a live re-read); a resolved link's target-wiki title (guaranteed by
  `resolvedTarget` being write-once and the placeholder reconstruction reading the LIVE element's
  attributes, so a resolution written after parsing still survives into the final HTML).

## Ownership rules, stage by stage

| Stage               | Reads                                            | Writes                                                                                          |
| -------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Parsing               | Parsoid HTML                                       | Creates the entire IR                                                                                |
| Link Resolution        | `links`, `categories`, `structure.templateLinkTargets` | `resolvedTarget` fields, `<a href>`/`<link href>`, `structure.templateLinkResolutions`                |
| Extraction              | `textNodes`                                        | Nothing (produces a derived `TranslationWorklist`, does not mutate the IR)                            |
| Chunking                 | `TranslationWorklist`                              | Nothing (produces `Chunk[]`)                                                                            |
| Translation                | `Chunk`                                            | Nothing (produces `TranslatedChunk`, external to the IR)                                                  |
| Merge                         | `TranslatedChunk`, `structure.nodeElements`/`templateParamWriters` | `TextNode.text`, `innerHTML` or `data-mw`                                                                   |
| Reference Attention              | `textNodes`                                        | Nothing (pure; its own output is currently discarded by the one call site — see [pipeline-stages.md](./pipeline-stages.md#8-reference-attention-not-a-numbered-stage)) |
| Generation                         | `structure.document`, `ir.links`                   | Removes denylisted-template elements; rewrites unresolved links into interwiki-fallback elements               |

A stage never reaches into another stage's private state through any channel other than the IR fields
listed above.
