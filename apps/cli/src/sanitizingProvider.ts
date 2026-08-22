/**
 * sanitizingProvider
 *
 * A decorator around Core's `TextProviderType` that cleans up the most
 * common way an LLM response is malformed for our purposes — wrapping
 * the whole answer in a Markdown code fence (``` ... ```) — before
 * handing it to Core's own segment parser
 * (`../stages/05-chunking/segmentProtocol.ts`, `parseChunkTranslation`).
 *
 * This deliberately does NOT re-implement Core's segment/structure
 * validation. Core already:
 *   - matches segments by `[[SEGMENT n]]` marker (segmentProtocol.ts),
 *     reporting `missingUnitIds` rather than failing outright;
 *   - retries missing units individually (Translator.ts);
 *   - throws `PerseusError("TranslationError", ...)` if a chunk still
 *     can't be fully translated after that;
 *   - tolerates placeholder-token (⟪n⟫...⟪/n⟫) corruption by rendering
 *     without the wrapping tag rather than throwing
 *     (placeholders.ts, reconstructHtmlFromPlaceholders);
 *   - refuses to merge a translated unit that references an unknown IR
 *     node (Merger.ts, Spec 12.2).
 * This module only strips the ONE extra failure mode those layers don't
 * already handle: the model wrapping its entire answer (markers and
 * all) in a code fence or prefacing it with a stray "Here is the
 * translation:" line, which would otherwise make every `[[SEGMENT n]]`
 * marker unmatchable.
 */
import type {
  TextProviderType,
  TranslationRequest,
  TranslationResult,
} from "@perseus/core";

const FENCE_PATTERN = /^\s*```[a-zA-Z]*\n([\s\S]*?)\n?```\s*$/;

/** Strips a single wrapping Markdown code fence, if the whole response is fenced. Leaves everything else untouched. */
function stripWrappingCodeFence(text: string): string {
  const match = FENCE_PATTERN.exec(text.trim());
  return match ? match[1] : text;
}

export class SanitizingProvider implements TextProviderType {
  readonly kind: TextProviderType["kind"];

  constructor(private readonly inner: TextProviderType) {
    this.kind = inner.kind;
  }

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    const response = await this.inner.translate(request);
    return { translatedText: stripWrappingCodeFence(response.translatedText) };
  }
}
