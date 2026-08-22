import { PerseusError } from "../../platform/errors/PerseusError";
import type { TranslationUsage } from "../06-translation/LLMProvider";
import type { Chunk } from "./Chunker";

export interface TranslatedUnit {
  nodeId: string;
  sourceText: string;
  translatedText: string;
}

export interface TranslatedChunk {
  id: string;
  units: TranslatedUnit[];
  usage?: TranslationUsage;
}

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function computeChunkFingerprint(chunk: Chunk): string {
  const canonical = [
    chunk.id,
    ...chunk.units.map((unit) => `${unit.nodeId}\u0001${unit.sourceText}`),
  ].join("\u0002");
  return fnv1a32(canonical).toString(16).padStart(8, "0");
}

function identityLine(chunk: Chunk): string {
  return `[[PERSEUS CHUNK ${chunk.id} ${computeChunkFingerprint(chunk)}]]`;
}

const IDENTITY_LINE_PATTERN =
  /^\[\[PERSEUS CHUNK (\S+) ([0-9a-f]{8})\]\]\s*\n?/;

export function renderChunkForTranslation(chunk: Chunk): string {
  const body = chunk.units
    .map((unit, i) => `[[SEGMENT ${i + 1}]]\n${unit.sourceText}`)
    .join("\n\n");
  return `${identityLine(chunk)}\n${body}`;
}

export function renderTranslatedChunkForEditing(
  chunk: Chunk,
  translatedByNodeId: ReadonlyMap<string, string>,
): string {
  const hasAnyTranslation = chunk.units.some((unit) =>
    translatedByNodeId.has(unit.nodeId),
  );

  if (!hasAnyTranslation) {
    return "";
  }

  const body = chunk.units
    .map(
      (unit, i) =>
        `[[SEGMENT ${i + 1}]]\n${translatedByNodeId.get(unit.nodeId) ?? unit.sourceText}`,
    )
    .join("\n\n");
  return `${identityLine(chunk)}\n${body}`;
}

const SEGMENT_PATTERN =
  /\[\[SEGMENT (\d+)\]\]\s*([\s\S]*?)(?=\[\[SEGMENT \d+\]\]|$)/g;

function parseSegmentedText(responseText: string): Map<number, string> {
  const result = new Map<number, string>();

  for (const match of responseText.matchAll(SEGMENT_PATTERN)) {
    const n = Number(match[1]);
    const text = match[2].trim();
    if (text) {
      result.set(n, text);
    }
  }

  return result;
}

function tokenSignatures(text: string): Set<string> {
  const signatures = new Set<string>();
  const pattern = /\u27EA(\*|\/)?(\d+)\u27EB/g;
  for (const match of text.matchAll(pattern)) {
    const shape =
      match[1] === "*" ? "solo" : match[1] === "/" ? "close" : "open";
    signatures.add(`${shape}:${match[2]}`);
  }
  return signatures;
}

function markersMatch(sourceText: string, translatedText: string): boolean {
  const source = tokenSignatures(sourceText);
  const translated = tokenSignatures(translatedText);

  if (source.size !== translated.size) return false;
  for (const sig of source) {
    if (!translated.has(sig)) return false;
  }

  const countOf = (text: string, sig: string): number => {
    const [shape, id] = sig.split(":");
    const token =
      shape === "solo"
        ? `\u27EA*${id}\u27EB`
        : shape === "close"
          ? `\u27EA/${id}\u27EB`
          : `\u27EA${id}\u27EB`;
    return text.split(token).length - 1;
  };
  for (const sig of source) {
    if (countOf(sourceText, sig) !== countOf(translatedText, sig)) return false;
  }

  const ids = new Set(
    [...source]
      .filter((sig) => sig.startsWith("open:"))
      .map((sig) => sig.slice(5)),
  );
  for (const id of ids) {
    const openIndex = translatedText.indexOf(`\u27EA${id}\u27EB`);
    const closeIndex = translatedText.indexOf(`\u27EA/${id}\u27EB`);
    if (openIndex === -1 || closeIndex === -1 || openIndex > closeIndex) {
      return false;
    }
  }

  return true;
}

export function parseChunkTranslation(
  chunk: Chunk,
  responseText: string,
): { units: TranslatedUnit[]; missingUnitIds: string[] } {
  const identityMatch = IDENTITY_LINE_PATTERN.exec(responseText);

  if (!identityMatch) {
    throw new PerseusError(
      "ChunkIdentityError",
      "This translation is missing its chunk identity marker and cannot be safely applied. Please paste the full, unmodified translation output.",
      { stage: "translation", context: { chunkId: chunk.id } },
    );
  }

  const [, pastedChunkId, pastedFingerprint] = identityMatch;
  const expectedFingerprint = computeChunkFingerprint(chunk);

  if (pastedChunkId !== chunk.id) {
    throw new PerseusError(
      "ChunkIdentityError",
      "This translation does not belong to the selected chunk. Please paste the translation into the correct chunk.",
      {
        stage: "translation",
        context: { chunkId: chunk.id, pastedChunkId },
      },
    );
  }

  if (pastedFingerprint !== expectedFingerprint) {
    throw new PerseusError(
      "ChunkIdentityError",
      "This translation does not match the current content of this chunk (it may be from an earlier or modified version). Please paste a fresh translation of this chunk.",
      {
        stage: "translation",
        context: {
          chunkId: chunk.id,
          expectedFingerprint,
          pastedFingerprint,
        },
      },
    );
  }

  const body = responseText.slice(identityMatch[0].length);
  const parsed = parseSegmentedText(body);
  const units: TranslatedUnit[] = [];
  const missingUnitIds: string[] = [];

  chunk.units.forEach((unit, index) => {
    const translated = parsed.get(index + 1);

    if (translated && markersMatch(unit.sourceText, translated)) {
      units.push({
        nodeId: unit.nodeId,
        sourceText: unit.sourceText,
        translatedText: translated,
      });
    } else {
      missingUnitIds.push(unit.nodeId);
    }
  });

  return { units, missingUnitIds };
}
