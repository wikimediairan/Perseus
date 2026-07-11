/**
 * placeholders.ts
 *
 * Shared inline-markup placeholder protocol used by ParsoidParser (to
 * flatten a block element's content into translatable plain text) and
 * Merger (to reconstruct HTML from the LLM's translated text). Kept in
 * one file because both directions of the transform must agree exactly
 * on the token format.
 *
 * Why this exists: the LLM must receive only human-readable text, never
 * raw markup (Software Specification, Section 10.4). A paragraph like
 * `<p>The <a href="./Sun">Sun</a> is a <b>star</b>.</p>` still needs its
 * link label and bold text translated — so instead of stripping inline
 * tags (losing them) or sending raw HTML (violating Section 10.4), we
 * flatten to plain text with lightweight numeric tokens marking where
 * each inline element starts/ends: `The ⟪1⟫Sun⟪/1⟫ is a ⟪2⟫star⟪/2⟫.`
 * The LLM is instructed (see prompt/PromptManager.ts) to translate the
 * text and keep the tokens exactly as-is. Merger then swaps the tokens
 * back for real markup using the captured PlaceholderSpan table.
 *
 * Citation markers (`[typeof*="mw:Extension/ref"]`) get a THIRD kind of
 * token — a solo, self-contained one — because they are never a
 * wrapper around translatable content the way `<a>` or `<b>` are: a
 * footnote marker's visible content is just an auto-numbered "[1]", and
 * its real payload is metadata (`data-mw`) that must never be touched.
 * Per the Citation Handling Redesign: Merge must never inspect HTML to
 * reconstruct a citation — the CitationRegistry is the single source of
 * truth. So a citation marker is captured as one opaque token, and
 * reconstruction resolves it via `registry.getReferenceHtml(id, ...)`
 * — a registry lookup, never a live DOM read — with any live/registry
 * disagreement resolved in the registry's favor and logged as a warning
 * (see CitationRegistry.getReferenceHtml/checkDrift). This is also what
 * fixes citations disappearing during translation: previously, citation
 * markers were skipped/invisible during flattening, so they were simply
 * absent from the reconstructed HTML once their containing paragraph
 * was translated. Now every occurrence is captured, tracked by id, and
 * always spliced back verbatim, regardless of what the LLM did to the
 * surrounding text.
 *
 * Tokens use U+27EA/U+27EB (mathematical angle brackets) specifically
 * because they essentially never occur in ordinary prose, so a token
 * surviving translation unmodified is easy to detect and unambiguous to
 * split on.
 */

import type { CitationRegistry } from '@core/ir/citation';
import type { PlaceholderSpan } from '@core/ir/IntermediateRepresentation';

/** Inline elements that are "transparent": their own text is translatable, but the tag itself must be preserved verbatim. */
export const TRANSPARENT_INLINE_TAGS = new Set([
  'a',
  'abbr',
  'b',
  'cite',
  'em',
  'i',
  'q',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'u',
]);

const CITATION_MARKER_SELECTOR = '[typeof*="mw:Extension/ref"]';

function openToken(id: number): string {
  return `\u27EA${id}\u27EB`;
}

function closeToken(id: number): string {
  return `\u27EA/${id}\u27EB`;
}

/** Solo token for citation markers: no wrapped content, the whole thing is substituted at once. */
function soloToken(id: number): string {
  return `\u27EA*${id}\u27EB`;
}

function isCitationMarker(el: Element): boolean {
  return el.matches?.(CITATION_MARKER_SELECTOR) ?? false;
}

function isTransclusion(el: Element): boolean {
  const typeofAttr = el.getAttribute('typeof') || '';
  return typeofAttr.split(/\s+/).some((t) => t.startsWith('mw:Transclusion'));
}

/**
 * Recursively flattens `root`'s child nodes into a plain-text string,
 * capturing every transparent inline element and every citation marker
 * it crosses as a PlaceholderSpan. Any templated subtree
 * (`typeof~="mw:Transclusion"`) is skipped entirely — neither its tag
 * nor its text becomes translatable content, per the Translation Rules
 * (templates must remain unchanged).
 *
 * `registry` is required so citation markers can be identified and
 * assigned their citation id (via `findReferenceIdByElement`) —
 * flattening never inspects `data-mw` itself; it only asks the registry
 * "is this element a known citation, and which one."
 */
export function flattenToPlaceholderText(
  root: Element,
  registry: CitationRegistry,
): { text: string, placeholders: PlaceholderSpan[] } {
  const placeholders: PlaceholderSpan[] = [];
  let nextId = 1;
  let text = '';

  function walk(node: Node): void {
    if (node.nodeType === node.TEXT_NODE) {
      text += node.textContent ?? '';
      return;
    }

    if (node.nodeType !== node.ELEMENT_NODE) {
      return;
    }

    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (isCitationMarker(el)) {
      const id = nextId++;
      const citationId = registry.findReferenceIdByElement(el);

      if (citationId === undefined) {
        // Should not normally happen — buildCitationRegistry scans the same
        // document for every mw:Extension/ref element. Preserve it verbatim
        // via a direct outerHTML capture rather than dropping it, and record
        // why, so this is visible instead of silently producing a gap.
        registry.warnings.push({
          kind: 'unsupported-structure',
          message:
            'A citation marker was found during translation extraction but is not in the registry; preserving it as-is.',
        });
      }

      placeholders.push({ id, tag, element: el, citationId });
      text += soloToken(id);
      return; // never recurse into a citation marker's children
    }

    if (isTransclusion(el)) {
      // Opaque: skip entirely, do not translate, do not preserve as a placeholder.
      return;
    }

    if (!TRANSPARENT_INLINE_TAGS.has(tag)) {
      // Unknown/opaque inline-ish tag: skip its content but don't fail the whole block.
      return;
    }

    const id = nextId++;
    placeholders.push({ id, tag, element: el });

    text += openToken(id);

    for (const child of el.childNodes) {
      walk(child);
    }

    text += closeToken(id);
  }

  for (const child of root.childNodes) {
    walk(child);
  }

  return { text: text.trim(), placeholders };
}

/**
 * Reverses `flattenToPlaceholderText`: given translated text (still
 * containing the placeholder tokens, ideally unmodified by the LLM) and
 * the PlaceholderSpan table captured at extraction time, reconstructs
 * an HTML string suitable for assigning to `element.innerHTML`.
 *
 * Citation spans (`citationId` set) are resolved through the registry
 * (`getReferenceHtml`) — never through `element.outerHTML` — per the
 * Citation Handling Redesign's "registry is the single source of truth"
 * rule. `span.element` is still passed along, purely so the registry can
 * detect drift and warn; the returned value is always the registry's
 * snapshot, never the live DOM.
 *
 * Robustness note (non-citation spans): if the LLM drops or reorders a
 * token (Section 15, Risk R-3 — translation quality is bounded by the
 * underlying model), this still produces valid HTML — any placeholder
 * whose tokens are missing simply has its text rendered without the
 * wrapping tag, rather than throwing.
 */
export function reconstructHtmlFromPlaceholders(
  translatedText: string,
  placeholders: PlaceholderSpan[],
  registry: CitationRegistry,
): string {
  let html = escapeHtmlExceptTokens(translatedText);

  for (const span of placeholders) {
    if (span.citationId !== undefined) {
      let citationHtml = registry.getReferenceHtml(
        span.citationId,
        span.element,
      );

      if (citationHtml === undefined) {
        // Registry has no record of this id at all (shouldn't happen — see the
        // matching warning pushed during flattening). Fall back to a live read
        // rather than losing the citation outright, and make the fallback visible.
        citationHtml = span.element.outerHTML;
        registry.warnings.push({
          kind: 'unsupported-structure',
          message: `Citation "${span.citationId}" was not found in the registry during reconstruction; used a live DOM read instead.`,
          citationId: span.citationId,
        });
      }

      html = html.split(soloToken(span.id)).join(citationHtml);
      continue;
    }

    const attrs = [...span.element.attributes]
      .map((attr) => `${attr.name}="${escapeAttr(attr.value)}"`)
      .join(' ');
    const openTag = attrs ? `<${span.tag} ${attrs}>` : `<${span.tag}>`;
    html = html.split(openToken(span.id)).join(openTag);
    html = html.split(closeToken(span.id)).join(`</${span.tag}>`);
  }

  return html;
}

function escapeAttr(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}

/** Escapes HTML-significant characters in translated text while leaving the placeholder tokens themselves untouched. */
function escapeHtmlExceptTokens(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
