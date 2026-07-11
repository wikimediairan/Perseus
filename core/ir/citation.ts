/**
 * Citation data structures for the IR.
 *
 * See the design proposal ("Citation Handling Redesign", Sections 3–4).
 * Types for a citation definition/reference, and the CitationRegistry
 * container that holds them and the relationships between them.
 *
 * The registry is the single source of truth for a citation's HTML: it
 * captures an immutable snapshot (`snapshotHtml`) at build time and
 * always returns that snapshot, never a live re-read of `element`. If a
 * live element is ever supplied for comparison and it disagrees with
 * the snapshot, the snapshot wins and a warning is recorded — see
 * getReferenceHtml/getDefinitionHtml. This file defines the data
 * structures and that resolution rule; actually building a registry
 * from a parsed article happens in parser/citations.ts, and nothing yet
 * consumes the registry during Merge/Generation.
 */

import type { Logger } from '@core/logging/Logger';

/** Stable id for a citation definition or reference, same scheme as LinkNode/TextNode ids (e.g. "cite-1"). */
export type CitationId = string;

/**
 * Best-effort structural classification, informational only — nothing in
 * the pipeline branches on this. Perseus never converts between styles;
 * this is purely for logging/UI/future extension.
 */
export type CitationStyle =
  | 'sfn' // {{sfn|...}} short-footnote
  | 'harv' // {{harv|...}} / {{harvnb|...}}
  | 'unknown' // couldn't classify — still preserved verbatim regardless
  | 'plain-text' // free-text <ref> body, no recognized template
  | 'cite-template'; // {{cite book}}, {{cite web}}, {{cite journal}}, ...

/**
 * A single translatable parameter value inside a citation (e.g. a
 * `title=` field). Reserved extension point for a later phase — nothing
 * currently populates this array. See the design proposal, Section 8.
 */
export interface CitationParameterRef {
  /** id of an ordinary IR TextNode holding this parameter's value, reusing the existing Extract/Translate/Merge path. */
  textNodeId: string,
  /** e.g. "title", "quote" — informational only. */
  parameterName: string,
}

/**
 * The actual citation content. Exactly one per unique `name` (or one per
 * anonymous `<ref>...</ref>`). `element` is a live DOM pointer, kept for
 * identity/debugging purposes only — it is NOT what reconstruction
 * should read from. `snapshotHtml` is the registry's own authoritative
 * copy of this citation's HTML, captured once when the registry is
 * built. The registry is the single source of truth for citation HTML;
 * if `element`'s current outerHTML ever disagrees with `snapshotHtml`,
 * `snapshotHtml` wins (see CitationRegistry.getReferenceHtml).
 */
export interface CitationDefinition {
  id: CitationId,
  /** null = anonymous <ref>...</ref>, never reused by name. */
  name: null | string,
  /** <ref group="..."> if present. */
  group: null | string,
  style: CitationStyle,
  /** dir="ltr"/"rtl" if present, preserved verbatim regardless of this field's presence. */
  dir: null | 'ltr' | 'rtl',
  /** Live DOM node holding this citation's content. Identity/debugging only — never read from for reconstruction. */
  element: null | Element,
  /** The registry's authoritative snapshot of this citation's HTML, captured once at build time. */
  snapshotHtml: string,
  /** ids of every CitationReference resolving to this definition, including the defining occurrence itself. */
  referencedBy: CitationId[],
  /** Reserved extension point — see CitationParameterRef. Always empty for now. */
  translatableParameters: CitationParameterRef[],
}

/**
 * A single `<ref>...</ref>` or `<ref name="x"/>` occurrence (call site)
 * in the article body. Same snapshot rule as CitationDefinition applies:
 * `snapshotHtml` — not `element` — is authoritative.
 */
export interface CitationReference {
  id: CitationId,
  name: null | string,
  group: null | string,
  /** True for the occurrence that carries the citation's body content. */
  isDefining: boolean,
  /** Resolved id of the CitationDefinition this points to, or null if unresolved. */
  definitionId: null | CitationId,
  /** Live DOM node for this call site. Identity/debugging only — never read from for reconstruction. */
  element: null | Element,
  /** The registry's authoritative snapshot of this reference's HTML, captured once at build time. */
  snapshotHtml: string,
}

export type CitationWarningKind =
  | 'html-drift' // the live DOM's HTML no longer matches the registry's snapshot; the snapshot was used
  | 'orphan-definition' // a definition nothing references
  | 'malformed-reference' // couldn't parse this citation's data at all
  | 'duplicate-definition' // the same name defines a body more than once
  | 'unsupported-structure' // an unrecognized/unsupported citation structure
  | 'missing-named-definition'; // a reference names a citation with no definition anywhere

export interface CitationRegistryWarning {
  kind: CitationWarningKind,
  message: string,
  citationId?: CitationId,
  name?: null | string,
}

/**
 * Holds every citation definition and reference found in an article, and
 * the relationships between them. Pure data structure: registration
 * methods here only do map/array bookkeeping and detect
 * duplicate/unresolved/orphaned entries — they do not read a DOM or know
 * anything about Parsoid. Building a registry FROM a parsed article is a
 * separate, later task.
 */
export class CitationRegistry {
  private readonly definitions = new Map<CitationId, CitationDefinition>();
  private readonly referencesById = new Map<CitationId, CitationReference>();
  /** name -> definitionId. Group-qualification, if needed, is left to whatever populates this later. */
  private readonly definitionIdByName = new Map<string, CitationId>();
  /** live element -> reference id, so callers (the placeholder mechanism) can identify "is this DOM node a citation marker, and which one" without re-deriving it. */
  private readonly referenceIdByElement = new Map<Element, CitationId>();
  /** How many `warnings` entries have already been flushed via flushWarningsTo — see that method. */
  private loggedWarningCount = 0;
  readonly warnings: CitationRegistryWarning[] = [];

  /**
   * Registers a citation definition. If `def.name` already has a
   * registered definition, this one is treated as a duplicate: it is
   * NOT inserted (the first definition remains authoritative), a
   * `duplicate-definition` warning is recorded, and the EXISTING
   * definition's id is returned so the caller can point this
   * occurrence's own CitationReference at the canonical definition
   * instead of creating an orphaned second one. Otherwise, `def` is
   * inserted and its own id is returned.
   */
  registerDefinition(def: CitationDefinition): CitationId {
    if (def.name !== null) {
      const existingId = this.definitionIdByName.get(def.name);

      if (existingId !== undefined && existingId !== def.id) {
        this.warnings.push({
          kind: 'duplicate-definition',
          message: `Citation name "${def.name}" is defined more than once; keeping the first definition.`,
          citationId: def.id,
          name: def.name,
        });
        return existingId;
      }

      this.definitionIdByName.set(def.name, def.id);
    }

    this.definitions.set(def.id, def);
    return def.id;
  }

  /** Looks up a known definition's id by name, without registering anything. Returns undefined if no definition with that name has been registered yet. */
  findDefinitionIdByName(name: string): undefined | CitationId {
    return this.definitionIdByName.get(name);
  }

  /** Registers a citation reference (call site), resolving it against a known definition by name if possible. */
  registerReference(ref: CitationReference): void {
    let { definitionId } = ref;

    if (definitionId === null && ref.name !== null) {
      const resolved = this.definitionIdByName.get(ref.name);

      if (resolved !== undefined) {
        definitionId = resolved;
      } else {
        this.warnings.push({
          kind: 'missing-named-definition',
          message: `Reference to citation "${ref.name}" has no matching definition.`,
          citationId: ref.id,
          name: ref.name,
        });
      }
    }

    const resolvedRef: CitationReference = { ...ref, definitionId };
    this.referencesById.set(resolvedRef.id, resolvedRef);

    if (resolvedRef.element) {
      this.referenceIdByElement.set(resolvedRef.element, resolvedRef.id);
    }

    if (definitionId !== null) {
      const def = this.definitions.get(definitionId);

      if (def && !def.referencedBy.includes(resolvedRef.id)) {
        def.referencedBy.push(resolvedRef.id);
      }
    }
  }

  /** Call once after all definitions/references have been registered. Detects definitions nothing points to. */
  finalize(): void {
    for (const def of this.definitions.values()) {
      if (def.referencedBy.length === 0) {
        this.warnings.push({
          kind: 'orphan-definition',
          message: def.name
            ? `Citation "${def.name}" is defined but never referenced.`
            : 'An anonymous citation is defined but never referenced.',
          citationId: def.id,
          name: def.name,
        });
      }
    }
  }

  getDefinition(id: CitationId): undefined | CitationDefinition {
    return this.definitions.get(id);
  }

  getReference(id: CitationId): undefined | CitationReference {
    return this.referencesById.get(id);
  }

  allDefinitions(): readonly CitationDefinition[] {
    return [...this.definitions.values()];
  }

  allReferences(): readonly CitationReference[] {
    return [...this.referencesById.values()];
  }

  /**
   * Returns the authoritative HTML for a citation reference — always
   * `snapshotHtml`, never a live DOM read. This is the one rule that
   * matters for reconstruction: the registry is the single source of
   * truth for citation HTML, full stop.
   *
   * `liveElement` is optional and purely diagnostic: if supplied and its
   * current `outerHTML` no longer matches the snapshot (something
   * mutated the DOM after the registry was built, which should never
   * happen but is exactly the kind of drift worth catching rather than
   * silently trusting), an `html-drift` warning is recorded. The
   * snapshot is returned either way — disagreement is resolved in the
   * registry's favor, not the DOM's.
   */
  getReferenceHtml(
    id: CitationId,
    liveElement?: null | Element,
  ): string | undefined {
    const ref = this.referencesById.get(id);
    if (!ref) { return undefined; }

    this.checkDrift(id, ref.name, ref.snapshotHtml, liveElement);
    return ref.snapshotHtml;
  }

  /** Same rule as getReferenceHtml, for a definition's own HTML. */
  getDefinitionHtml(
    id: CitationId,
    liveElement?: null | Element,
  ): string | undefined {
    const def = this.definitions.get(id);
    if (!def) { return undefined; }

    this.checkDrift(id, def.name, def.snapshotHtml, liveElement);
    return def.snapshotHtml;
  }

  private checkDrift(
    id: CitationId,
    name: null | string,
    snapshotHtml: string,
    liveElement?: null | Element,
  ): void {
    if (!liveElement) { return; }

    if (liveElement.outerHTML !== snapshotHtml) {
      this.warnings.push({
        kind: 'html-drift',
        message: `Citation "${id}"'s current HTML no longer matches the registry's snapshot; using the registry's version.`,
        citationId: id,
        name,
      });
    }
  }

  /** Identifies which citation reference (if any) a given live DOM element corresponds to. Used by the placeholder mechanism so it never has to re-derive citation identity from the DOM itself — it just asks the registry. */
  findReferenceIdByElement(element: Element): undefined | CitationId {
    return this.referenceIdByElement.get(element);
  }

  /**
   * Logs every warning recorded so far that hasn't already been logged
   * via this method, through the given Logger, then marks them as
   * logged. Idempotent and safe to call from multiple stages as the
   * registry accumulates more warnings over the course of a pipeline
   * run (e.g. once after parsing, once after merging) — each call only
   * logs what's new since the last call, so nothing is logged twice.
   * `warnings` itself is never cleared, so it always reflects the full
   * history for anything else that wants to inspect it directly.
   */
  flushWarningsTo(logger: Logger): void {
    for (let i = this.loggedWarningCount; i < this.warnings.length; i++) {
      const w = this.warnings[i];
      logger.warn(w.message, {
        kind: w.kind,
        citationId: w.citationId,
        name: w.name ?? undefined,
      });
    }

    this.loggedWarningCount = this.warnings.length;
  }
}
