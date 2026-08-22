import type { Logger } from "../platform/logging/Logger";

export type CitationId = string;

export type CitationStyle =
  | "sfn"
  | "harv"
  | "unknown"
  | "plain-text"
  | "cite-template";

interface CitationParameterRef {
  textNodeId: string;

  parameterName: string;
}

export interface CitationDefinition {
  id: CitationId;

  name: null | string;

  group: null | string;
  style: CitationStyle;

  dir: null | "ltr" | "rtl";

  element: null | Element;

  snapshotHtml: string;

  referencedBy: CitationId[];

  translatableParameters: CitationParameterRef[];
}

export interface CitationReference {
  id: CitationId;
  name: null | string;
  group: null | string;

  isDefining: boolean;

  definitionId: null | CitationId;

  element: null | Element;

  snapshotHtml: string;
}

type CitationWarningKind =
  | "html-drift"
  | "orphan-definition"
  | "malformed-reference"
  | "duplicate-definition"
  | "unsupported-structure"
  | "missing-named-definition";

export interface CitationRegistryWarning {
  kind: CitationWarningKind;
  message: string;
  citationId?: CitationId;
  name?: null | string;
}

export class CitationRegistry {
  private readonly definitions = new Map<CitationId, CitationDefinition>();
  private readonly referencesById = new Map<CitationId, CitationReference>();

  private readonly definitionIdByName = new Map<string, CitationId>();

  private readonly referenceIdByElement = new Map<Element, CitationId>();

  private loggedWarningCount = 0;
  readonly warnings: CitationRegistryWarning[] = [];

  registerDefinition(def: CitationDefinition): CitationId {
    if (def.name !== null) {
      const existingId = this.definitionIdByName.get(def.name);

      if (existingId !== undefined && existingId !== def.id) {
        this.warnings.push({
          kind: "duplicate-definition",
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

  findDefinitionIdByName(name: string): undefined | CitationId {
    return this.definitionIdByName.get(name);
  }

  registerReference(ref: CitationReference): void {
    let { definitionId } = ref;

    if (definitionId === null && ref.name !== null) {
      const resolved = this.definitionIdByName.get(ref.name);

      if (resolved !== undefined) {
        definitionId = resolved;
      } else {
        this.warnings.push({
          kind: "missing-named-definition",
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

  finalize(): void {
    for (const def of this.definitions.values()) {
      if (def.referencedBy.length === 0) {
        this.warnings.push({
          kind: "orphan-definition",
          message: def.name
            ? `Citation "${def.name}" is defined but never referenced.`
            : "An anonymous citation is defined but never referenced.",
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

  getReferenceHtml(
    id: CitationId,
    liveElement?: null | Element,
  ): string | undefined {
    const ref = this.referencesById.get(id);
    if (!ref) {
      return undefined;
    }

    this.checkDrift(id, ref.name, ref.snapshotHtml, liveElement);
    return ref.snapshotHtml;
  }

  getDefinitionHtml(
    id: CitationId,
    liveElement?: null | Element,
  ): string | undefined {
    const def = this.definitions.get(id);
    if (!def) {
      return undefined;
    }

    this.checkDrift(id, def.name, def.snapshotHtml, liveElement);
    return def.snapshotHtml;
  }

  private checkDrift(
    id: CitationId,
    name: null | string,
    snapshotHtml: string,
    liveElement?: null | Element,
  ): void {
    if (!liveElement) {
      return;
    }

    if (liveElement.outerHTML !== snapshotHtml) {
      this.warnings.push({
        kind: "html-drift",
        message: `Citation "${id}"'s current HTML no longer matches the registry's snapshot; using the registry's version.`,
        citationId: id,
        name,
      });
    }
  }

  findReferenceIdByElement(element: Element): undefined | CitationId {
    return this.referenceIdByElement.get(element);
  }

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
