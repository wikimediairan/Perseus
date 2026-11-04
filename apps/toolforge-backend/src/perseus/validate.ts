import type {
  ChunkPlan,
  TranslatedChunkRecord,
  WorkUnit,
} from "../domain/types.js";
import { ApiError } from "../util/errors.js";

const TOKEN_PATTERN = /⟪(\*|\/)?(\d+)⟫/g;
const REF_SELECTOR = '[typeof~="mw:Extension/ref"]';

interface TokenCounts {
  counts: Map<string, number>;
}

function tokenCounts(text: string): TokenCounts {
  const counts = new Map<string, number>();

  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const marker = match[1];
    const id = match[2];
    if (!id) continue;
    const signature =
      marker === "*"
        ? `solo:${id}`
        : marker === "/"
          ? `close:${id}`
          : `open:${id}`;
    counts.set(signature, (counts.get(signature) ?? 0) + 1);
  }

  return { counts };
}

function assertNoRawTokenArtifacts(text: string, unit: WorkUnit): void {
  const tokenCount = [...text.matchAll(TOKEN_PATTERN)].length;
  const openCount = (text.match(/⟪/g) ?? []).length;
  const closeCount = (text.match(/⟫/g) ?? []).length;

  if (tokenCount !== openCount || tokenCount !== closeCount) {
    throw new ApiError(
      422,
      "TRANSLATION_INVALID",
      `Translated unit ${unit.nodeId} contains a malformed protected marker.`,
      { nodeId: unit.nodeId },
    );
  }
}

function assertTokensMatch(source: WorkUnit, translated: string): void {
  const sourceCounts = tokenCounts(source.sourceText);
  const translatedCounts = tokenCounts(translated);

  if (sourceCounts.counts.size !== translatedCounts.counts.size) {
    throw new ApiError(
      422,
      "TRANSLATION_INVALID",
      `Translated unit ${source.nodeId} changed the set of protected markers.`,
      { nodeId: source.nodeId },
    );
  }

  for (const [signature, count] of sourceCounts.counts) {
    if ((translatedCounts.counts.get(signature) ?? 0) !== count) {
      throw new ApiError(
        422,
        "TRANSLATION_INVALID",
        `Translated unit ${source.nodeId} changed protected marker "${signature}".`,
        { nodeId: source.nodeId, signature },
      );
    }
  }

  const openIds = [...sourceCounts.counts.keys()]
    .filter((signature) => signature.startsWith("open:"))
    .map((signature) => signature.slice("open:".length));

  for (const id of openIds) {
    const openIndex = translated.indexOf(`⟪${id}⟫`);
    const closeIndex = translated.indexOf(`⟪/${id}⟫`);
    if (openIndex === -1 || closeIndex === -1 || openIndex >= closeIndex) {
      throw new ApiError(
        422,
        "TRANSLATION_INVALID",
        `Translated unit ${source.nodeId} has an invalid open/close order for marker ${id}.`,
        { nodeId: source.nodeId, markerId: id },
      );
    }
  }

  const stack: string[] = [];
  for (const marker of translated.matchAll(TOKEN_PATTERN)) {
    const id = marker[2];
    if (!id || marker[1] === "*") continue;
    if (marker[1] === "/") {
      if (stack.pop() !== id) {
        throw new ApiError(
          422,
          "TRANSLATION_INVALID",
          `Translated unit ${source.nodeId} has crossed protected markers.`,
          { nodeId: source.nodeId },
        );
      }
    } else {
      stack.push(id);
    }
  }
  if (stack.length > 0) {
    throw new ApiError(
      422,
      "TRANSLATION_INVALID",
      `Translated unit ${source.nodeId} has unclosed protected markers.`,
      { nodeId: source.nodeId },
    );
  }
}

function normalizedWords(text: string): string {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function occurrences(haystack: string, needle: string): number {
  let count = 0;
  let start = 0;
  for (;;) {
    const index = haystack.indexOf(needle, start);
    if (index < 0) return count;
    count++;
    start = index + needle.length;
  }
}

interface ReferenceKindCounts {
  definitions: number;
  usages: number;
}

interface ReferenceInventory extends ReferenceKindCounts {
  total: number;
  anonymousDefinitions: number;
  unknown: number;
  byName: Map<string, ReferenceKindCounts>;
  malformed: boolean;
}

function emptyReferenceInventory(): ReferenceInventory {
  return {
    total: 0,
    definitions: 0,
    usages: 0,
    anonymousDefinitions: 0,
    unknown: 0,
    byName: new Map(),
    malformed: false,
  };
}

function decodeReferenceAttribute(value: string): string {
  return value.replace(
    /&(?:#(\d+)|#x([\da-f]+)|amp|quot|apos|lt|gt);/gi,
    (entity, decimal: string | undefined, hex: string | undefined) => {
      const numeric = decimal
        ? Number.parseInt(decimal, 10)
        : hex
          ? Number.parseInt(hex, 16)
          : null;
      if (numeric !== null) {
        return numeric <= 0x10ffff ? String.fromCodePoint(numeric) : entity;
      }
      switch (entity.toLowerCase()) {
        case "&amp;":
          return "&";
        case "&quot;":
          return '"';
        case "&apos;":
          return "'";
        case "&lt;":
          return "<";
        case "&gt;":
          return ">";
        default:
          return entity;
      }
    },
  );
}

function referenceKey(name: string, group: string | null): string {
  return JSON.stringify([
    decodeReferenceAttribute(group ?? ""),
    decodeReferenceAttribute(name),
  ]);
}

function incrementNamedReference(
  inventory: ReferenceInventory,
  name: string,
  group: string | null,
  kind: keyof ReferenceKindCounts,
): void {
  const key = referenceKey(name, group);
  const counts = inventory.byName.get(key) ?? { definitions: 0, usages: 0 };
  counts[kind]++;
  inventory.byName.set(key, counts);
}

function sourceReferenceInventory(
  root: Element,
  outsideTemplate: (element: Element) => boolean,
): ReferenceInventory {
  const inventory = emptyReferenceInventory();

  for (const element of Array.from(root.querySelectorAll(REF_SELECTOR)).filter(
    outsideTemplate,
  )) {
    inventory.total++;
    const raw = element.getAttribute("data-mw");
    if (!raw) {
      inventory.unknown++;
      continue;
    }

    let data: {
      attrs?: { name?: unknown; group?: unknown };
      body?: { html?: unknown; id?: unknown };
    };
    try {
      data = JSON.parse(raw) as typeof data;
    } catch {
      inventory.unknown++;
      continue;
    }

    const name = typeof data.attrs?.name === "string" ? data.attrs.name : null;
    const group =
      typeof data.attrs?.group === "string" ? data.attrs.group : null;
    const isDefinition =
      typeof data.body?.html === "string" || typeof data.body?.id === "string";

    if (isDefinition) {
      inventory.definitions++;
      if (name === null) {
        inventory.anonymousDefinitions++;
      } else {
        incrementNamedReference(inventory, name, group, "definitions");
      }
    } else if (name !== null) {
      inventory.usages++;
      incrementNamedReference(inventory, name, group, "usages");
    } else {
      inventory.unknown++;
    }
  }

  return inventory;
}

function wikitextAttribute(
  attributes: string,
  attributeName: string,
): string | null {
  const match = attributes.match(
    new RegExp(
      `(?:^|\\s)${attributeName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`,
      "i",
    ),
  );
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function generatedReferenceInventory(wikitext: string): ReferenceInventory {
  const inventory = emptyReferenceInventory();
  const openingTag = /<ref\b((?:"[^"]*"|'[^']*'|[^'">])*)>/gi;

  for (const match of wikitext.matchAll(openingTag)) {
    const fullTag = match[0];
    const attributes = match[1] ?? "";
    const name = wikitextAttribute(attributes, "name");
    const group = wikitextAttribute(attributes, "group");
    const isUsage = /\/\s*>$/.test(fullTag);

    inventory.total++;
    if (isUsage) {
      if (name === null) {
        inventory.unknown++;
      } else {
        inventory.usages++;
        incrementNamedReference(inventory, name, group, "usages");
      }
    } else {
      inventory.definitions++;
      if (name === null) {
        inventory.anonymousDefinitions++;
      } else {
        incrementNamedReference(inventory, name, group, "definitions");
      }
    }
  }

  const closingTags = (wikitext.match(/<\/ref\s*>/gi) ?? []).length;
  inventory.malformed = closingTags !== inventory.definitions;
  return inventory;
}

function assertReferencesPreserved(
  source: ReferenceInventory,
  generated: ReferenceInventory,
): void {
  const diagnostic = {
    source: {
      total: source.total,
      definitions: source.definitions,
      usages: source.usages,
      anonymousDefinitions: source.anonymousDefinitions,
      unknown: source.unknown,
    },
    generated: {
      total: generated.total,
      definitions: generated.definitions,
      usages: generated.usages,
      anonymousDefinitions: generated.anonymousDefinitions,
      unknown: generated.unknown,
      malformed: generated.malformed,
    },
  };

  if (generated.malformed) {
    throw new ApiError(
      422,
      "OUTPUT_STRUCTURE_LOSS",
      "The generated wikitext contains malformed refs.",
      diagnostic,
    );
  }

  if (
    generated.total < source.total ||
    generated.definitions < source.definitions ||
    generated.usages < source.usages ||
    generated.anonymousDefinitions < source.anonymousDefinitions
  ) {
    throw new ApiError(
      422,
      "OUTPUT_STRUCTURE_LOSS",
      "The generated wikitext omitted refs.",
      diagnostic,
    );
  }

  for (const [key, expected] of source.byName) {
    const actual = generated.byName.get(key);
    if (
      (actual?.definitions ?? 0) < expected.definitions ||
      (actual?.usages ?? 0) < expected.usages
    ) {
      throw new ApiError(
        422,
        "OUTPUT_STRUCTURE_LOSS",
        "The generated wikitext omitted refs.",
        diagnostic,
      );
    }
  }
}

export function validateOutputCoverage(
  wikitext: string,
  translations: TranslatedChunkRecord[],
): void {
  const actual = ` ${normalizedWords(wikitext)} `;
  const expected = new Map<string, number>();

  for (const chunk of translations) {
    for (const unit of chunk.units) {
      const pieces = unit.translatedText.split(/⟪(?:\*|\/)?\d+⟫/g);
      for (const piece of pieces) {
        const normalized = normalizedWords(piece);
        if ([...normalized].length < 2) continue;
        const phrase = ` ${normalized} `;
        expected.set(phrase, (expected.get(phrase) ?? 0) + 1);
      }
    }
  }

  for (const [phrase, count] of expected) {
    if (occurrences(actual, phrase) < count) {
      throw new ApiError(
        422,
        "OUTPUT_CONTENT_LOSS",
        "The generated wikitext omitted translated content.",
      );
    }
  }
}

/** Checks for wholesale structural loss in Parsoid's final serialization. */
export function validateGeneratedStructure(
  root: Element,
  wikitext: string,
  targetWiki: string,
): void {
  const outsideTemplate = (element: Element): boolean =>
    !element.closest('[typeof*="mw:Transclusion"]');
  const count = (selector: string): number =>
    Array.from(root.querySelectorAll(selector)).filter(outsideTemplate).length;
  const sourceRefs = sourceReferenceInventory(root, outsideTemplate);
  const source = {
    referenceLists: count('[typeof~="mw:Extension/references"]'),
    tables: count("table"),
    templates: root.querySelectorAll('[typeof*="mw:Transclusion"]').length,
    links: count('a[rel~="mw:WikiLink"]'),
  };
  const output = wikitext.replace(/<!--[\s\S]*?-->/g, "");
  const generatedRefs = generatedReferenceInventory(output);
  const generated = {
    referenceLists: (output.match(/<references\b/gi) ?? []).length,
    tables: (output.match(/\{\||<table\b/gi) ?? []).length,
    templates: Math.max(
      0,
      (output.match(/\{\{/g) ?? []).length - (targetWiki === "fa" ? 1 : 0),
    ),
    links:
      (output.match(/\[\[/g) ?? []).length +
      (targetWiki === "fa"
        ? (output.match(/\{\{\s*پم\s*\|/g) ?? []).length
        : 0),
  };
  assertReferencesPreserved(sourceRefs, generatedRefs);

  if (generated.referenceLists < source.referenceLists) {
    throw new ApiError(
      422,
      "OUTPUT_STRUCTURE_LOSS",
      "The generated wikitext omitted a references list.",
    );
  }

  for (const kind of ["tables", "templates", "links"] as const) {
    if (generated[kind] < source[kind]) {
      throw new ApiError(
        422,
        "OUTPUT_STRUCTURE_LOSS",
        `The generated wikitext omitted ${kind}.`,
      );
    }
  }

  const normalizeTemplate = (name: string): string =>
    name
      .replace(/^template\s*:/i, "")
      .replaceAll("_", " ")
      .trim()
      .toLocaleLowerCase()
      .replace(/\s+/g, " ");
  const expectedTemplates = new Map<string, number>();
  for (const element of root.querySelectorAll('[typeof*="mw:Transclusion"]')) {
    const raw = element.getAttribute("data-mw");
    if (!raw) continue;
    let data: { parts?: { template?: { target?: { wt?: string } } }[] };
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    for (const part of data.parts ?? []) {
      const name = part.template?.target?.wt;
      if (!name) continue;
      const key = normalizeTemplate(name);
      expectedTemplates.set(key, (expectedTemplates.get(key) ?? 0) + 1);
    }
  }
  if (expectedTemplates.size > 0) {
    const actualTemplates = new Map<string, number>();
    for (const match of output.matchAll(
      /\{\{\s*(?:subst\s*:\s*)?([^{}|\n]+)/gi,
    )) {
      const name = match[1];
      if (!name) continue;
      const key = normalizeTemplate(name);
      actualTemplates.set(key, (actualTemplates.get(key) ?? 0) + 1);
    }
    for (const [name, needed] of expectedTemplates) {
      if ((actualTemplates.get(name) ?? 0) < needed) {
        throw new ApiError(
          422,
          "OUTPUT_STRUCTURE_LOSS",
          "The generated wikitext omitted a protected template.",
        );
      }
    }
  }
}

export function validateTranslatedChunk(
  chunk: ChunkPlan,
  translated: TranslatedChunkRecord,
): TranslatedChunkRecord {
  if (translated.id !== chunk.id) {
    throw new ApiError(
      422,
      "TRANSLATION_INVALID",
      "The translator returned a different chunk id.",
      { expected: chunk.id, received: translated.id },
    );
  }

  if (translated.units.length !== chunk.units.length) {
    throw new ApiError(
      422,
      "TRANSLATION_INVALID",
      "The translator returned an incomplete chunk.",
      {
        expectedUnits: chunk.units.length,
        receivedUnits: translated.units.length,
      },
    );
  }

  const byNodeId = new Map(translated.units.map((unit) => [unit.nodeId, unit]));

  for (const sourceUnit of chunk.units) {
    const unit = byNodeId.get(sourceUnit.nodeId);
    if (!unit) {
      throw new ApiError(
        422,
        "TRANSLATION_INVALID",
        `The translator omitted unit ${sourceUnit.nodeId}.`,
        { nodeId: sourceUnit.nodeId },
      );
    }

    if (!unit.translatedText.trim()) {
      throw new ApiError(
        422,
        "TRANSLATION_INVALID",
        `The translator returned an empty translation for ${sourceUnit.nodeId}.`,
        { nodeId: sourceUnit.nodeId },
      );
    }

    if (/\[\[PERSEUS\b|\[\[SEGMENT\b/i.test(unit.translatedText)) {
      throw new ApiError(
        422,
        "TRANSLATION_INVALID",
        `The translator leaked Perseus protocol markers into ${sourceUnit.nodeId}.`,
        { nodeId: sourceUnit.nodeId },
      );
    }

    if (unit.sourceText !== sourceUnit.sourceText) {
      throw new ApiError(
        422,
        "TRANSLATION_STALE",
        `The translated unit ${sourceUnit.nodeId} does not match the source text.`,
        { nodeId: sourceUnit.nodeId },
      );
    }

    assertNoRawTokenArtifacts(unit.translatedText, sourceUnit);
    assertTokensMatch(sourceUnit, unit.translatedText);
  }

  for (const unit of translated.units) {
    if (!chunk.units.some((source) => source.nodeId === unit.nodeId)) {
      throw new ApiError(
        422,
        "TRANSLATION_INVALID",
        `The translator returned an unknown unit ${unit.nodeId}.`,
        { nodeId: unit.nodeId },
      );
    }
  }

  return translated;
}

export function validateFinalWikitext(
  wikitext: string,
  translations: TranslatedChunkRecord[] = [],
): string {
  if (!wikitext.trim()) {
    throw new ApiError(422, "OUTPUT_EMPTY", "The generated wikitext is empty.");
  }

  if (/⟪|⟫/.test(wikitext)) {
    throw new ApiError(
      422,
      "OUTPUT_PROTOCOL_LEAK",
      "The generated wikitext contains an internal Perseus marker.",
    );
  }

  if (/\[\[PERSEUS\b|\[\[SEGMENT\b/i.test(wikitext)) {
    throw new ApiError(
      422,
      "OUTPUT_PROTOCOL_LEAK",
      "The generated wikitext contains a Perseus protocol marker.",
    );
  }

  validateOutputCoverage(wikitext, translations);
  return wikitext;
}
