/**
 * Translation Session — validate
 *
 * Deterministic, dependency-free shape validation for a session file
 * that may have come from anywhere (disk, hand-edited, or produced by an
 * external AI) — so nothing here can be assumed safe. Every failure is a
 * `PerseusError("InputError", ...)` with a message specific enough to
 * act on.
 *
 * Version dispatch: `CURRENT_FORMAT_VERSION` is the only version this
 * build understands. Perseus hasn't shipped externally yet, so there is
 * no prior version to migrate from — but the dispatch point below is
 * where a future `formatVersion` migration would branch, so the NEXT
 * breaking change has somewhere to go instead of requiring another
 * rewrite of this file.
 */

import { isTargetWikiCode } from "@core/config/targetWikis";
import { PerseusError } from "@core/errors/PerseusError";
import type {
  SessionChunk,
  TranslationEntryTuple,
  TranslationSession,
} from "@core/translationPackage/types";
import { CURRENT_FORMAT_VERSION, PACKAGE_FORMAT_MARKER } from "@core/translationPackage/types";

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
    throw new PerseusError("InputError", "Translation Session is invalid: expected a JSON object.");
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
    // Version-dispatch point: a future formatVersion would branch here
    // (e.g. `if (data.formatVersion === 1) return migrateV1(data)`).
    throw new PerseusError(
      "InputError",
      `Translation Session is invalid: unsupported formatVersion "${String(data.formatVersion)}" (expected ${CURRENT_FORMAT_VERSION}).`,
    );
  }

  const articleTitle = requireString(data.meta.articleTitle, "meta.articleTitle");
  const sourceLanguage = requireString(data.meta.sourceLanguage, "meta.sourceLanguage");
  const exportedAt = requireString(data.meta.exportedAt, "meta.exportedAt");
  const chunkCharBudget = requireFiniteNumber(data.meta.chunkCharBudget, "meta.chunkCharBudget");

  if (!isTargetWikiCode(data.meta.targetWiki)) {
    throw new PerseusError(
      "InputError",
      `Translation Session is invalid: unsupported meta.targetWiki "${String(data.meta.targetWiki)}". This build of Perseus may be older than the one that created this session.`,
    );
  }

  const targetWiki = data.meta.targetWiki;

  if (!isRecord(data.snapshot)) {
    throw new PerseusError(
      "InputError",
      'Translation Session is invalid: "snapshot" must be an object.',
    );
  }

  const parsoidHtml = requireString(data.snapshot.parsoidHtml, "snapshot.parsoidHtml");

  if (!isRecord(data.provenance)) {
    throw new PerseusError(
      "InputError",
      'Translation Session is invalid: "provenance" must be an object.',
    );
  }

  const rawWikitext = requireString(data.provenance.rawWikitext, "provenance.rawWikitext");

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

    const translation = validateTranslationTuples(rawChunk.translation, chunkIndex, seenEntryIds);

    return { id, translation };
  });

  return {
    format: PACKAGE_FORMAT_MARKER,
    formatVersion: CURRENT_FORMAT_VERSION,
    meta: {
      articleTitle,
      sourceLanguage,
      targetWiki,
      exportedAt,
      chunkCharBudget,
    },
    snapshot: { parsoidHtml },
    provenance: { rawWikitext },
    chunks,
  };
}
