import { describe, expect, it } from "vitest";
import { PerseusError } from "../src/platform/errors/PerseusError";
import type { Chunk } from "../src/stages/05-chunking/Chunker";
import {
  computeChunkFingerprint,
  parseChunkTranslation,
  renderChunkForTranslation,
  renderTranslatedChunkForEditing,
} from "../src/stages/05-chunking/segmentProtocol";

const chunkA: Chunk = {
  id: "chunk-1",
  units: [
    { nodeId: "text-1", sourceText: "Hello ⟪1⟫world⟪/1⟫." },
    { nodeId: "text-2", sourceText: "Second paragraph." },
  ],
};

const chunkB: Chunk = {
  id: "chunk-2",
  units: [
    { nodeId: "text-3", sourceText: "Different content entirely." },
    { nodeId: "text-4", sourceText: "Another paragraph here." },
  ],
};

/** A chunk that is structurally identical in shape to chunkA (same unit count) but has different source content — the "structurally similar" adversarial case. */
const chunkBSameShape: Chunk = {
  id: "chunk-3",
  units: [
    { nodeId: "text-5", sourceText: "Totally different ⟪1⟫text⟪/1⟫ here." },
    { nodeId: "text-6", sourceText: "Yet another paragraph." },
  ],
};

describe("Chunk identity — Layer 1 (the newly discovered root cause)", () => {
  it("1. translation from Chunk A pasted into Chunk A → accepted", () => {
    const rendered = renderChunkForTranslation(chunkA);
    // Simulate a well-behaved translator: keep the identity line, translate the segments.
    const translated = rendered
      .replace("Hello ⟪1⟫world⟪/1⟫.", "سلام ⟪1⟫دنیا⟪/1⟫.")
      .replace("Second paragraph.", "پاراگراف دوم.");

    const { units, missingUnitIds } = parseChunkTranslation(chunkA, translated);

    expect(missingUnitIds).toEqual([]);
    expect(units).toHaveLength(2);
    expect(units[0].translatedText).toContain("دنیا");
  });

  it("2. translation from Chunk A pasted into Chunk B → rejected", () => {
    const chunkAsTranslation = renderChunkForTranslation(chunkA);

    expect(() => parseChunkTranslation(chunkB, chunkAsTranslation)).toThrow(
      PerseusError,
    );

    try {
      parseChunkTranslation(chunkB, chunkAsTranslation);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(PerseusError);
      const err = error as PerseusError;
      expect(err.category).toBe("ChunkIdentityError");
      expect(err.message).toContain("does not belong to the selected chunk");
    }
  });

  it("3. translation from Chunk A pasted into a structurally similar Chunk B (same unit count/shape) → rejected", () => {
    const chunkAsTranslation = renderChunkForTranslation(chunkA);

    expect(() =>
      parseChunkTranslation(chunkBSameShape, chunkAsTranslation),
    ).toThrow(PerseusError);
  });

  it("4. two chunks with similar text but different source identity → rejected", () => {
    const similarChunk: Chunk = {
      id: "chunk-1", // same id as chunkA...
      units: [
        { nodeId: "text-1", sourceText: "Hello ⟪1⟫world⟪/1⟫!" }, // ...but "!" instead of "." — different content
        { nodeId: "text-2", sourceText: "Second paragraph." },
      ],
    };
    const rendered = renderChunkForTranslation(similarChunk);

    // Same chunk id, but chunkA's OWN fingerprint won't match this
    // slightly-different chunk's — a tampered/stale-content case.
    expect(() => parseChunkTranslation(chunkA, rendered)).toThrow(PerseusError);
    try {
      parseChunkTranslation(chunkA, rendered);
    } catch (error) {
      expect((error as PerseusError).message).toContain(
        "does not match the current content",
      );
    }
  });

  it("5. modified/tampered chunk identity (fingerprint hand-edited) → rejected", () => {
    const rendered = renderChunkForTranslation(chunkA);
    const tampered = rendered.replace(
      computeChunkFingerprint(chunkA),
      "deadbeef",
    );

    expect(() => parseChunkTranslation(chunkA, tampered)).toThrow(PerseusError);
  });

  it("6. missing/invalid identity metadata → rejected safely (not silently accepted)", () => {
    const noIdentityLine =
      "[[SEGMENT 1]]\nسلام دنیا\n\n[[SEGMENT 2]]\nپاراگراف دوم";

    expect(() => parseChunkTranslation(chunkA, noIdentityLine)).toThrow(
      PerseusError,
    );
    try {
      parseChunkTranslation(chunkA, noIdentityLine);
    } catch (error) {
      expect((error as PerseusError).category).toBe("ChunkIdentityError");
      expect((error as PerseusError).message).toContain(
        "missing its chunk identity",
      );
    }
  });

  it("7. existing valid translation flow (render → translate → parse, same chunk) remains unchanged", () => {
    const rendered = renderChunkForTranslation(chunkA);
    expect(rendered).toContain("[[PERSEUS CHUNK chunk-1");
    expect(rendered).toContain("[[SEGMENT 1]]");
    expect(rendered).toContain("[[SEGMENT 2]]");

    const { units } = parseChunkTranslation(chunkA, rendered); // untranslated round-trip
    expect(units.map((u) => u.nodeId)).toEqual(["text-1", "text-2"]);
  });

  it("an in-place edit-and-blur of a chunk's own already-translated textarea still passes (renderTranslatedChunkForEditing carries the same identity)", () => {
    const translatedByNodeId = new Map([
      ["text-1", "سلام ⟪1⟫دنیا⟪/1⟫"],
      ["text-2", "پاراگراف دوم"],
    ]);
    const editable = renderTranslatedChunkForEditing(
      chunkA,
      translatedByNodeId,
    );

    // User tweaks one word and the textarea blurs, re-submitting the SAME chunk's content.
    const edited = editable.replace("پاراگراف دوم", "پاراگراف دوم ویرایش شده");

    const { units, missingUnitIds } = parseChunkTranslation(chunkA, edited);
    expect(missingUnitIds).toEqual([]);
    expect(units[1].translatedText).toContain("ویرایش شده");
  });

  it("computeChunkFingerprint is deterministic for identical chunk content", () => {
    const a = computeChunkFingerprint(chunkA);
    const b = computeChunkFingerprint({
      id: chunkA.id,
      units: chunkA.units.map((u) => ({ ...u })),
    });
    expect(a).toBe(b);
  });

  it("computeChunkFingerprint differs for different content", () => {
    expect(computeChunkFingerprint(chunkA)).not.toBe(
      computeChunkFingerprint(chunkB),
    );
  });
});

describe("Marker integrity — Layer 2 (only reached once Layer 1 passes)", () => {
  function bodyFor(chunk: Chunk, segments: string[]): string {
    const body = segments
      .map((s, i) => `[[SEGMENT ${i + 1}]]\n${s}`)
      .join("\n\n");
    return `[[PERSEUS CHUNK ${chunk.id} ${computeChunkFingerprint(chunk)}]]\n${body}`;
  }

  it("accepts a segment whose markers exactly match the source", () => {
    const text = bodyFor(chunkA, ["سلام ⟪1⟫دنیا⟪/1⟫.", "پاراگراف دوم."]);
    const { units, missingUnitIds } = parseChunkTranslation(chunkA, text);
    expect(missingUnitIds).toEqual([]);
    expect(units).toHaveLength(2);
  });

  it("rejects (treats as missing) a segment with a dropped marker", () => {
    const text = bodyFor(chunkA, ["سلام دنیا.", "پاراگراف دوم."]); // segment 1 lost ⟪1⟫/⟪/1⟫ entirely
    const { units, missingUnitIds } = parseChunkTranslation(chunkA, text);
    expect(missingUnitIds).toEqual(["text-1"]);
    expect(units.map((u) => u.nodeId)).toEqual(["text-2"]);
  });

  it("rejects a segment with a duplicated marker", () => {
    const text = bodyFor(chunkA, [
      "سلام ⟪1⟫دنیا⟪/1⟫ ⟪1⟫دوباره⟪/1⟫.",
      "پاراگراف دوم.",
    ]);
    const { missingUnitIds } = parseChunkTranslation(chunkA, text);
    expect(missingUnitIds).toContain("text-1");
  });

  it("rejects a segment with a mismatched/unexpected marker id", () => {
    const text = bodyFor(chunkA, ["سلام ⟪7⟫دنیا⟪/7⟫.", "پاراگراف دوم."]); // id 7 was never in the source
    const { missingUnitIds } = parseChunkTranslation(chunkA, text);
    expect(missingUnitIds).toContain("text-1");
  });

  it("rejects a segment with a malformed (unbalanced) marker", () => {
    const text = bodyFor(chunkA, ["سلام ⟪1⟫دنیا.", "پاراگراف دوم."]); // opening token, no closing token
    const { missingUnitIds } = parseChunkTranslation(chunkA, text);
    expect(missingUnitIds).toContain("text-1");
  });

  it("does NOT accept Persian/Arabic-Indic digits as equivalent to the ASCII marker id", () => {
    // "⟪/۶⟫" using a Persian-Indic 6 must NOT satisfy a source's "⟪/6⟫".
    const sourceWithMarker6: Chunk = {
      id: "chunk-9",
      units: [{ nodeId: "text-9", sourceText: "Text with ⟪6⟫a marker⟪/6⟫." }],
    };
    const text = bodyFor(sourceWithMarker6, ["متن با ⟪6⟫یک نشانگر⟪/۶⟫."]); // closing token uses ۶ (U+06F6), not 6

    const { missingUnitIds } = parseChunkTranslation(sourceWithMarker6, text);
    expect(missingUnitIds).toContain("text-9");
  });

  it("accepts markers for DIFFERENT ids appearing in a different order than the source (natural-language reordering, e.g. Persian clause order)", () => {
    const source: Chunk = {
      id: "chunk-reorder",
      units: [
        {
          nodeId: "text-r",
          sourceText: "Hello ⟪1⟫world⟪/1⟫ and ⟪2⟫moon⟪/2⟫.",
        },
      ],
    };
    // Marker 2's span appears BEFORE marker 1's span in the translation —
    // a legitimate word-order difference, not corruption.
    const text = bodyFor(source, ["⟪2⟫ماه⟪/2⟫ و ⟪1⟫دنیا⟪/1⟫ سلام."]);

    const { units, missingUnitIds } = parseChunkTranslation(source, text);
    expect(missingUnitIds).toEqual([]);
    expect(units).toHaveLength(1);
    expect(units[0].translatedText).toBe("⟪2⟫ماه⟪/2⟫ و ⟪1⟫دنیا⟪/1⟫ سلام.");
  });

  it("still rejects a SAME id's own open/close pair being internally swapped (open after close — would produce invalid HTML nesting)", () => {
    const source: Chunk = {
      id: "chunk-swap",
      units: [{ nodeId: "text-s", sourceText: "Hello ⟪1⟫world⟪/1⟫." }],
    };
    const text = bodyFor(source, ["سلام ⟪/1⟫دنیا⟪1⟫."]); // close comes before open for id 1

    const { missingUnitIds } = parseChunkTranslation(source, text);
    expect(missingUnitIds).toContain("text-s");
  });

  it("a chunk with no markers at all still round-trips normally", () => {
    const plain: Chunk = {
      id: "chunk-plain",
      units: [{ nodeId: "text-p", sourceText: "Plain text, no markers." }],
    };
    const text = bodyFor(plain, ["متن ساده، بدون نشانگر."]);
    const { units, missingUnitIds } = parseChunkTranslation(plain, text);
    expect(missingUnitIds).toEqual([]);
    expect(units).toHaveLength(1);
  });
});
