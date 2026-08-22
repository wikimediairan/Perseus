import {
  normalizeTitle,
  renderInterwikiTemplateCall,
  stripFragment,
  type TemplateLinkResolution,
} from "../../ir/wikitextLinkUtils";

let idCounter = 0;

export function resetWikitextTokenCounterForTests(): void {
  idCounter = 0;
}

export interface WikitextTokenSpan {
  id: number;
  kind: "link" | "opaque";

  target?: string;

  render: () => string;
}

function openToken(id: number): string {
  return `\u27EA${id}\u27EB`;
}
function closeToken(id: number): string {
  return `\u27EA/${id}\u27EB`;
}
function soloToken(id: number): string {
  return `\u27EA*${id}\u27EB`;
}

function findMatchingBraceEnd(wt: string, start: number): number {
  let depth = 0;
  for (let i = start; i < wt.length - 1; i++) {
    if (wt[i] === "{" && wt[i + 1] === "{") {
      depth++;
      i++;
    } else if (wt[i] === "}" && wt[i + 1] === "}") {
      depth--;
      i++;
      if (depth === 0) {
        return i + 1;
      }
    }
  }
  return -1;
}

function findMatchingBracketEnd(wt: string, start: number): number {
  const end = wt.indexOf("]]", start);
  return end === -1 ? -1 : end + 2;
}

const REF_TAG_PATTERN = /<ref\b[^>]*\/>|<ref\b[^>]*>[\s\S]*?<\/ref>/i;

const HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->/;

export interface TokenizeOptions {
  onNestedTemplate: (rawTemplateCall: string) => WikitextTokenSpan;
}

export function tokenizeWikitextValue(
  wt: string,
  options: TokenizeOptions,
): { text: string; spans: WikitextTokenSpan[] } {
  const spans: WikitextTokenSpan[] = [];
  let text = "";
  let i = 0;

  while (i < wt.length) {
    if (wt[i] === "{" && wt[i + 1] === "{") {
      const end = findMatchingBraceEnd(wt, i);
      if (end === -1) {
        text += wt[i];
        i++;
        continue;
      }
      const raw = wt.slice(i, end);
      const span = options.onNestedTemplate(raw);
      spans.push(span);
      text += soloToken(span.id);
      i = end;
      continue;
    }

    if (wt[i] === "[" && wt[i + 1] === "[") {
      const end = findMatchingBracketEnd(wt, i);
      if (end === -1) {
        text += wt[i];
        i++;
        continue;
      }
      const inner = wt.slice(i + 2, end - 2);
      const pipeIndex = inner.indexOf("|");
      const rawTarget = pipeIndex === -1 ? inner : inner.slice(0, pipeIndex);
      const label = pipeIndex === -1 ? inner : inner.slice(pipeIndex + 1);

      const { title: target } = stripFragment(rawTarget);
      const id = ++idCounter;
      spans.push({
        id,
        kind: "link",
        target,
        render: () => label, // unused for "link" spans — reconstruction rebuilds `[[target|label]]` (or an interwiki fallback call) directly, see reconstructWikitextValue
      });
      text += openToken(id) + label + closeToken(id);
      i = end;
      continue;
    }

    const commentMatch = HTML_COMMENT_PATTERN.exec(wt.slice(i));
    if (commentMatch && commentMatch.index === 0) {
      const raw = commentMatch[0];
      const id = ++idCounter;
      spans.push({ id, kind: "opaque", render: () => raw });
      text += soloToken(id);
      i += raw.length;
      continue;
    }

    const refMatch = REF_TAG_PATTERN.exec(wt.slice(i));
    if (refMatch && refMatch.index === 0) {
      const raw = refMatch[0];
      const id = ++idCounter;
      spans.push({ id, kind: "opaque", render: () => raw });
      text += soloToken(id);
      i += raw.length;
      continue;
    }

    text += wt[i];
    i++;
  }

  return { text: text.trim(), spans };
}

export function reconstructWikitextValue(
  translatedText: string,
  spans: WikitextTokenSpan[],
  linkResolutions?: Map<string, TemplateLinkResolution>,
): string {
  let wt = translatedText;

  for (const span of spans) {
    if (span.kind === "link") {
      const open = openToken(span.id);
      const close = closeToken(span.id);
      const openIdx = wt.indexOf(open);
      const closeIdx = wt.indexOf(close);

      if (openIdx === -1 || closeIdx === -1 || closeIdx <= openIdx) {
        wt = wt.split(open).join("").split(close).join("");
        continue;
      }

      const label = wt.slice(openIdx + open.length, closeIdx);
      const resolution = linkResolutions?.get(
        normalizeTitle(span.target ?? ""),
      );

      let rebuilt: string;

      if (resolution?.resolvedTarget) {
        rebuilt =
          label === resolution.resolvedTarget
            ? `[[${resolution.resolvedTarget}]]`
            : `[[${resolution.resolvedTarget}|${label}]]`;
      } else if (
        resolution &&
        resolution.resolvedTarget === null &&
        resolution.fallbackTemplateName
      ) {
        rebuilt = renderInterwikiTemplateCall(
          resolution.fallbackTemplateName,
          label,
          span.target ?? "",
        );
      } else {
        rebuilt =
          label === span.target
            ? `[[${span.target}]]`
            : `[[${span.target}|${label}]]`;
      }

      wt = wt.slice(0, openIdx) + rebuilt + wt.slice(closeIdx + close.length);
      continue;
    }

    wt = wt.split(soloToken(span.id)).join(span.render());
  }

  return wt;
}
