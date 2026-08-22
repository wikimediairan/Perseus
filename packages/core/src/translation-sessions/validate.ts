import { SOURCE_WIKI_CODE } from "../config/constants";
import { isTargetWikiCode } from "../config/targetWikis";
import { PerseusError } from "../platform/errors/PerseusError";
import type {
  SessionChunk,
  TranslationEntryTuple,
  TranslationSession,
} from "./types";
import { CURRENT_FORMAT_VERSION, PACKAGE_FORMAT_MARKER } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new PerseusError(
      "InputError",
      `Translation Session is invalid: "${field}" must be a string.`,
    );
  }

  return value;
}

function requireFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new PerseusError(
      "InputError",
      `Translation Session is invalid: "${field}" must be a number.`,
    );
  }

  return value;
}

function validateTranslationTuples(
  raw: unknown,
  chunkIndex: number,
  seenIds: Set<number>,
): TranslationEntryTuple[] {
  if (!Array.isArray(raw)) {
    throw new PerseusError(
      "InputError",
      `Translation Session is invalid: chunks[${chunkIndex}].translation must be an array.`,
    );
  }

  return raw.map((rawTuple, entryIndex) => {
    if (!Array.isArray(rawTuple) || rawTuple.length !== 3) {
      throw new PerseusError(
        "InputError",
        `Translation Session is invalid: chunks[${chunkIndex}].translation[${entryIndex}] must be a [id, tag, text] tuple.`,
      );
    }

    const [id, tag, text] = rawTuple as unknown[];

    if (typeof id !== "number" || !Number.isFinite(id)) {
      throw new PerseusError(
        "InputError",
        `Translation Session is invalid: chunks[${chunkIndex}].translation[${entryIndex}][0] (id) must be a number.`,
      );
    }

    if (typeof tag !== "string") {
      throw new PerseusError(
        "InputError",
        `Translation Session is invalid: chunks[${chunkIndex}].translation[${entryIndex}][1] (tag) must be a string.`,
      );
    }

    if (typeof text !== "string") {
      throw new PerseusError(
        "InputError",
        `Translation Session is invalid: chunks[${chunkIndex}].translation[${entryIndex}][2] (text) must be a string.`,
      );
    }

    if (seenIds.has(id)) {
      throw new PerseusError(
        "InputError",
        `Translation Session is invalid: duplicate entry id ${id}. Each entry must have a unique id across the whole session.`,
      );
    }

    seenIds.add(id);
    return [id, tag, text];
  });
}

export function validateTranslationSession(data: unknown): TranslationSession {
  if (!isRecord(data)) {
    throw new PerseusError(
      "InputError",
      "Translation Session is invalid: expected a JSON object.",
    );
  }

  if (data.format !== PACKAGE_FORMAT_MARKER) {
    throw new PerseusError(
      "InputError",
      `This file does not look like a Perseus Translation Session (expected "format": "${PACKAGE_FORMAT_MARKER}").`,
    );
  }

  if (!isRecord(data.meta)) {
    throw new PerseusError(
      "InputError",
      'Translation Session is invalid: "meta" must be an object.',
    );
  }

  if (data.formatVersion !== CURRENT_FORMAT_VERSION) {
    throw new PerseusError(
      "InputError",
      `Translation Session is invalid: unsupported formatVersion "${String(data.formatVersion)}" (expected ${CURRENT_FORMAT_VERSION}).`,
    );
  }

  const sourceLanguage = requireString(
    data.meta.sourceLanguage,
    "meta.sourceLanguage",
  );
  const exportedAt = requireString(data.meta.exportedAt, "meta.exportedAt");
  const chunkCharBudget = requireFiniteNumber(
    data.meta.chunkCharBudget,
    "meta.chunkCharBudget",
  );

  if (!isTargetWikiCode(data.meta.targetWiki)) {
    throw new PerseusError(
      "InputError",
      `Translation Session is invalid: unsupported meta.targetWiki "${String(data.meta.targetWiki)}". This build of Perseus may be older than the one that created this session.`,
    );
  }

  const targetWiki = data.meta.targetWiki;

  if (!isRecord(data.source)) {
    throw new PerseusError(
      "InputError",
      'Translation Session is invalid: "source" must be an object.',
    );
  }

  const wiki = requireString(data.source.wiki, "source.wiki");

  if (wiki !== SOURCE_WIKI_CODE) {
    throw new PerseusError(
      "InputError",
      `Translation Session is invalid: unsupported source.wiki "${wiki}" (expected "${SOURCE_WIKI_CODE}"). Perseus only translates from English Wikipedia.`,
    );
  }

  const pageId = requireFiniteNumber(data.source.pageId, "source.pageId");
  const title = requireString(data.source.title, "source.title");
  const revisionId = requireFiniteNumber(
    data.source.revisionId,
    "source.revisionId",
  );

  if (!Array.isArray(data.chunks)) {
    throw new PerseusError(
      "InputError",
      'Translation Session is invalid: "chunks" must be an array.',
    );
  }

  const seenChunkIds = new Set<string>();
  const seenEntryIds = new Set<number>();

  const chunks: SessionChunk[] = data.chunks.map((rawChunk, chunkIndex) => {
    if (!isRecord(rawChunk)) {
      throw new PerseusError(
        "InputError",
        `Translation Session is invalid: chunks[${chunkIndex}] must be an object.`,
      );
    }

    const id = requireString(rawChunk.id, `chunks[${chunkIndex}].id`);

    if (seenChunkIds.has(id)) {
      throw new PerseusError(
        "InputError",
        `Translation Session is invalid: duplicate chunk id "${id}".`,
      );
    }

    seenChunkIds.add(id);

    const translation = validateTranslationTuples(
      rawChunk.translation,
      chunkIndex,
      seenEntryIds,
    );

    return { id, translation };
  });

  return {
    format: PACKAGE_FORMAT_MARKER,
    formatVersion: CURRENT_FORMAT_VERSION,
    meta: {
      sourceLanguage,
      targetWiki,
      exportedAt,
      chunkCharBudget,
    },
    source: { wiki, pageId, title, revisionId },
    chunks,
  };
}
