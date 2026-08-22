import type { CitationRegistry } from "../../ir/citation";
import type { PlaceholderSpan } from "../../ir/IntermediateRepresentation";

function assertDefined<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
}

const TRANSPARENT_INLINE_TAGS = new Set([
  "a",
  "abbr",
  "b",
  "cite",
  "em",
  "i",
  "q",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "u",
]);

const CITATION_MARKER_SELECTOR = '[typeof*="mw:Extension/ref"]';

function openToken(id: number): string {
  return `\u27EA${id}\u27EB`;
}

function closeToken(id: number): string {
  return `\u27EA/${id}\u27EB`;
}

function soloToken(id: number): string {
  return `\u27EA*${id}\u27EB`;
}

function isCitationMarker(el: Element): boolean {
  return el.matches?.(CITATION_MARKER_SELECTOR) ?? false;
}

function isBareExternalLink(el: Element): boolean {
  if (el.tagName.toLowerCase() !== "a") return false;

  const rel = el.getAttribute("rel") ?? "";
  if (!rel.split(/\s+/).includes("mw:ExtLink")) return false;

  const href = (el.getAttribute("href") ?? "").trim();
  const text = (el.textContent ?? "").trim();
  return href !== "" && href === text;
}

function isTransclusion(el: Element): boolean {
  const typeofAttr = el.getAttribute("typeof") || "";
  return typeofAttr.split(/\s+/).some((t) => t.startsWith("mw:Transclusion"));
}

export function flattenToPlaceholderText(
  root: Element,
  registry: CitationRegistry,
): { text: string; placeholders: PlaceholderSpan[] } {
  const placeholders: PlaceholderSpan[] = [];
  let nextId = 1;
  let text = "";

  function walk(node: Node): void {
    if (node.nodeType === node.TEXT_NODE) {
      text += node.textContent ?? "";
      return;
    }

    if (node.nodeType === node.COMMENT_NODE) {
      const id = nextId++;
      placeholders.push({
        id,
        tag: "#comment",
        verbatimHtml: `<!--${node.textContent ?? ""}-->`,
      });
      text += soloToken(id);
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
        registry.warnings.push({
          kind: "unsupported-structure",
          message:
            "A citation marker was found during translation extraction but is not in the registry; preserving it as-is.",
        });
      }

      placeholders.push({ id, tag, element: el, citationId });
      text += soloToken(id);
      return;
    }

    if (isBareExternalLink(el)) {
      const id = nextId++;
      placeholders.push({ id, tag, element: el, verbatim: true });
      text += soloToken(id);
      return;
    }

    if (isTransclusion(el)) {
      return;
    }

    if (!TRANSPARENT_INLINE_TAGS.has(tag)) {
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

export function reconstructHtmlFromPlaceholders(
  translatedText: string,
  placeholders: PlaceholderSpan[],
  registry: CitationRegistry,
): string {
  let html = escapeHtmlExceptTokens(translatedText);

  for (const span of placeholders) {
    if (span.verbatimHtml !== undefined) {
      html = html.split(soloToken(span.id)).join(span.verbatimHtml);
      continue;
    }

    if (span.verbatim) {
      const element = assertDefined(
        span.element,
        `Verbatim placeholder ${span.id} (<${span.tag}>) is missing its source element.`,
      );
      html = html.split(soloToken(span.id)).join(element.outerHTML);
      continue;
    }

    if (span.citationId !== undefined) {
      let citationHtml = registry.getReferenceHtml(
        span.citationId,
        span.element,
      );

      if (citationHtml === undefined) {
        citationHtml = assertDefined(
          span.element,
          `Citation placeholder ${span.id} ("${span.citationId}") is missing its source element.`,
        ).outerHTML;
        registry.warnings.push({
          kind: "unsupported-structure",
          message: `Citation "${span.citationId}" was not found in the registry during reconstruction; used a live DOM read instead.`,
          citationId: span.citationId,
        });
      }

      html = html.split(soloToken(span.id)).join(citationHtml);
      continue;
    }

    const wrapElement = assertDefined(
      span.element,
      `Placeholder ${span.id} (<${span.tag}>) is missing its source element.`,
    );
    const attrs = [...wrapElement.attributes]
      .map((attr) => `${attr.name}="${escapeAttr(attr.value)}"`)
      .join(" ");
    const openTag = attrs ? `<${span.tag} ${attrs}>` : `<${span.tag}>`;
    html = html.split(openToken(span.id)).join(openTag);
    html = html.split(closeToken(span.id)).join(`</${span.tag}>`);
  }

  return html;
}

function escapeAttr(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

function escapeHtmlExceptTokens(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
