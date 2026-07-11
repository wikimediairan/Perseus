/**
 * IntermediateRepresentation (IR)
 *
 * The canonical, single-source-of-truth data model (Software
 * Specification, Section 8). Phase 3 fleshes out the "structure" field
 * that Phase 2 deliberately left as `unknown` (Spec 8.4 — full node
 * hierarchy explicitly deferred to the implementation phase).
 *
 * Design decision (Phase 3): rather than inventing a bespoke tree node
 * type system, the IR's structural backbone is the live Parsoid DOM
 * itself (a `Document`, produced by parsing Parsoid's HTML output — see
 * parser/ParsoidParser.ts). This keeps "Parsoid is the only parser" true
 * in the strongest sense: we never re-derive structure ourselves, we
 * keep Parsoid's own structural representation alive for the lifetime of
 * the pipeline run and mutate it in place, exactly as Section 8.5 (IR
 * Lifecycle) describes. `textNodes`/`links` remain the flat, addressable
 * public views over that DOM that the rest of the pipeline was already
 * designed around (Extractor, Merger, etc. only ever touch these, never
 * `structure` directly, except the Parser/LinkResolver/Merger/Generator
 * stages that are explicitly allowed to mutate the IR — see Spec 7.1).
 */

import type { CitationId } from '@core/ir/citation';
import { CitationRegistry } from '@core/ir/citation';
import type { LinkNode } from '@core/ir/LinkNode';

/** Natural-language span inside the IR, addressable by id. */
export interface TextNode {
  id: string,
  /**
   * Human-readable text only. Before translation, this is the extracted
   * English source (with inline-markup placeholder tokens — see
   * parser/placeholders.ts). After Merge, it is overwritten in place
   * with the target-wiki translation, per Spec 8.2 ("the same node is
   * updated in place, not replaced").
   */
  text: string,
}

/** One inline element (a, b, i, ...) or citation marker captured while flattening a block's content into translatable text. */
export interface PlaceholderSpan {
  /** Numeric placeholder id, unique within its owning TextNode. */
  id: number,
  tag: string,
  /**
   * Live reference to the original DOM element this placeholder stands
   * in for. For ordinary inline tags, reconstruction (Merger) reads
   * attributes from this element at merge time, not from a snapshot
   * taken during parsing — this matters because Link Resolution mutates
   * an `<a>` element's `href` AFTER parsing but BEFORE merging, and that
   * mutation must survive into the final reconstructed HTML.
   */
  element: Element,
  /**
   * Set when this span represents a citation marker
   * (`[typeof*="mw:Extension/ref"]`). When present, reconstruction does
   * NOT rebuild a tag from `element`'s live attributes — it asks the
   * CitationRegistry for this id's authoritative snapshot HTML instead
   * (see parser/placeholders.ts, reconstructHtmlFromPlaceholders). The
   * registry is the single source of truth for citation HTML; `element`
   * is kept only so the registry can detect drift and warn.
   */
  citationId?: CitationId,
}

/**
 * The structural backbone of the IR. Deliberately NOT part of the public
 * core/index.ts surface in its raw form — other stages interact with it
 * only through the flat `links`/`textNodes` arrays. Only Parser,
 * LinkResolver, Merger, and WikitextGenerator reach into `structure`
 * directly, consistent with "only three stages mutate the IR" (Spec
 * 7.1) plus the one read-only consumer (Generation).
 */
export interface IRStructure {
  /** The live Parsoid DOM for this pipeline run. Not persisted beyond the run (Spec 8.5, "Discarded"). */
  document: Document,
  /** TextNode id -> the DOM element whose innerHTML holds that node's (placeholder-encoded) content. */
  nodeElements: Map<string, Element>,
  /** TextNode id -> the inline-element placeholder table captured during extraction (see parser/placeholders.ts). */
  placeholders: Map<string, PlaceholderSpan[]>,
  /** LinkNode id -> the DOM `<a>` element, so Link Resolution can update its href in place. */
  linkElements: Map<string, Element>,
}

export interface IntermediateRepresentation {
  sourceTitle: string,
  links: LinkNode[],
  textNodes: TextNode[],
  /**
   * Citation definitions/references found in the article (Citation
   * Handling Redesign). Every IR owns a CitationRegistry, even if empty —
   * see createEmptyIR and ParsoidParser.
   */
  citations: CitationRegistry,
  structure: IRStructure,
}

/** Constructs an empty IR shell around a freshly created, empty document. Used by tests and as a defensive default. */
export function createEmptyIR(
  sourceTitle: string,
  document: Document,
): IntermediateRepresentation {
  return {
    sourceTitle,
    links: [],
    textNodes: [],
    citations: new CitationRegistry(),
    structure: {
      document,
      nodeElements: new Map(),
      placeholders: new Map(),
      linkElements: new Map(),
    },
  };
}
