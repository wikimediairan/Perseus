import type { TextNode } from "../../ir/IntermediateRepresentation";
import type { TemplateLinkResolution } from "../../ir/wikitextLinkUtils";
import {
  reconstructWikitextValue,
  tokenizeWikitextValue,
  type WikitextTokenSpan,
} from "./templateWikitextTokens";

const MAX_RECURSION_DEPTH = 4;

export function normalizeTemplateName(name: string): string {
  return name.trim().replace(/_/g, " ").replace(/\s+/g, " ").toLowerCase();
}

export function isAllowedTopLevelTemplateName(name: string): boolean {
  const n = normalizeTemplateName(name);
  return (
    n === "blockquote" ||
    n === "infobox" ||
    n.startsWith("infobox ") ||
    n === "short description" ||
    n === "about" ||
    n === "quote box" ||
    n === "multiple image" ||
    n === "efn"
  );
}

export function isRecursableTemplateName(name: string): boolean {
  return (
    isAllowedTopLevelTemplateName(name) ||
    normalizeTemplateName(name) === "cslist"
  );
}

function isProtectedParameterName(
  name: string,
  templateName?: string,
): boolean {
  const n = name.toLowerCase();
  const exact = new Set([
    "url",
    "website",
    "coordinates",
    "coords",
    "alt",
    "image_alt",
    "access-date",
    "accessdate",
    "archive-date",
    "archivedate",
    "archive-url",
    "archiveurl",
    "date",

    "align",
    "width",
    "height",
    "bgcolor",
    "background",
    "total_width",

    "name",
    "group",
  ]);
  if (exact.has(n)) return true;
  if (/^(image|logo|flag|map)\d*(_.*)?$/.test(n)) return true;

  if (/url$/i.test(n)) return true;

  if (templateName === "about" && /^\d+$/.test(n)) {
    const index = Number(n);
    if (index >= 3 && index % 2 === 1) return true;
  }

  return false;
}

function splitTopLevel(s: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2);
    if (two === "[[" || two === "{{") {
      depth++;
      current += two;
      i++;
      continue;
    }
    if (two === "]]" || two === "}}") {
      depth = Math.max(0, depth - 1);
      current += two;
      i++;
      continue;
    }
    if (depth === 0 && s[i] === separator) {
      parts.push(current);
      current = "";
      continue;
    }
    current += s[i];
  }
  parts.push(current);
  return parts;
}

interface ParsedTemplateCall {
  originalName: string;
  args: { key: string; value: string; isNamed: boolean }[];
}

function parseTemplateCall(raw: string): ParsedTemplateCall | null {
  if (!raw.startsWith("{{") || !raw.endsWith("}}")) return null;
  const inner = raw.slice(2, -2);
  const segments = splitTopLevel(inner, "|");
  const originalName = segments[0] ?? "";
  let positionalIndex = 0;

  const args = segments.slice(1).map((segment) => {
    const eqParts = splitTopLevel(segment, "=");
    if (
      eqParts.length >= 2 &&
      eqParts[0].trim().length > 0 &&
      /^[\w \-.:]+$/.test(eqParts[0].trim())
    ) {
      const key = eqParts[0].trim();
      const value = eqParts.slice(1).join("=");
      return { key, value, isNamed: true };
    }
    positionalIndex++;
    return { key: String(positionalIndex), value: segment, isNamed: false };
  });

  return { originalName, args };
}

interface Box<T> {
  value: T;
}

export interface TemplateExtractionResult {
  textNodes: TextNode[];

  nodeElements: Map<string, Element>;

  templateParamWriters: Map<string, (translatedText: string) => void>;

  linkTargets: string[];
}

function buildParamNode(
  paramName: string,
  rawWt: string,
  depth: number,
  templateName: string,
  nextNodeId: () => string,
  onLeaf: (node: TextNode, writer: (t: string) => void) => void,
  requestCommit: () => void,
  collectLinkTarget: (target: string) => void,
  templateLinkResolutions: Map<string, TemplateLinkResolution>,
): () => string {
  if (
    isProtectedParameterName(paramName, templateName) ||
    depth > MAX_RECURSION_DEPTH
  ) {
    return () => rawWt;
  }

  const { text, spans } = tokenizeWikitextValue(rawWt, {
    onNestedTemplate: (rawCall) =>
      buildNestedTemplateSpan(
        rawCall,
        depth,
        nextNodeId,
        onLeaf,
        requestCommit,
        collectLinkTarget,
        templateLinkResolutions,
      ),
  });

  for (const span of spans) {
    if (span.kind === "link" && span.target) {
      collectLinkTarget(span.target);
    }
  }

  const translatedHolder: Box<string> = { value: text };
  const nodeId = nextNodeId();
  onLeaf({ id: nodeId, text }, (translated) => {
    translatedHolder.value = translated;
    requestCommit();
  });

  return () =>
    reconstructWikitextValue(
      translatedHolder.value,
      spans,
      templateLinkResolutions,
    );
}

function buildNestedTemplateSpan(
  rawCall: string,
  parentDepth: number,
  nextNodeId: () => string,
  onLeaf: (node: TextNode, writer: (t: string) => void) => void,
  requestCommit: () => void,
  collectLinkTarget: (target: string) => void,
  templateLinkResolutions: Map<string, TemplateLinkResolution>,
): WikitextTokenSpan {
  const id = nextSpanIdCounter();
  const parsed =
    parentDepth < MAX_RECURSION_DEPTH ? parseTemplateCall(rawCall) : null;

  if (!parsed || !isRecursableTemplateName(parsed.originalName)) {
    return { id, kind: "opaque", render: () => rawCall };
  }

  const argGetters = parsed.args.map((arg) => ({
    arg,
    getValue: buildParamNode(
      arg.key,
      arg.value,
      parentDepth + 1,
      normalizeTemplateName(parsed.originalName),
      nextNodeId,
      onLeaf,
      requestCommit,
      collectLinkTarget,
      templateLinkResolutions,
    ),
  }));

  const render = () => {
    const rendered = argGetters
      .map(({ arg, getValue }) =>
        arg.isNamed ? `${arg.key}=${getValue()}` : getValue(),
      )
      .join("|");
    return `{{${parsed.originalName}|${rendered}}}`;
  };

  return { id, kind: "opaque", render };
}

let spanIdCounter = 0;
function nextSpanIdCounter(): number {
  return ++spanIdCounter;
}

interface DataMwTemplatePart {
  template?: {
    target?: { wt?: string };
    params?: Record<string, { wt?: string }>;
    i?: number;
  };
}

function readDataMw(el: Element): { parts: DataMwTemplatePart[] } | null {
  const raw = (el as HTMLElement).dataset?.mw ?? el.getAttribute("data-mw");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { parts?: DataMwTemplatePart[] };
    return Array.isArray(parsed.parts) ? { parts: parsed.parts } : null;
  } catch {
    return null;
  }
}

function isTopLevelTransclusion(el: Element): boolean {
  const typeofAttr = el.getAttribute("typeof") || "";
  return typeofAttr
    .split(/\s+/)
    .some((t) => t === "mw:Transclusion" || t.startsWith("mw:Transclusion/"));
}

export function isOutermostTransclusion(el: Element): boolean {
  if (!isTopLevelTransclusion(el)) return false;
  let ancestor = el.parentElement;
  while (ancestor) {
    if (isTopLevelTransclusion(ancestor)) return false;
    ancestor = ancestor.parentElement;
  }
  return true;
}

export function getTopLevelTemplateName(el: Element): string | null {
  return readDataMw(el)?.parts?.[0]?.template?.target?.wt ?? null;
}

export function extractTemplateParameterUnits(
  root: Element,
  startTextIdCounter: number,
  excludedElements?: Set<Element>,

  templateLinkResolutions: Map<string, TemplateLinkResolution> = new Map(),
): { result: TemplateExtractionResult; nextTextIdCounter: number } {
  const textNodes: TextNode[] = [];
  const nodeElements = new Map<string, Element>();
  const templateParamWriters = new Map<string, (t: string) => void>();
  const linkTargets: string[] = [];
  const collectLinkTarget = (target: string) => {
    linkTargets.push(target);
  };

  let textIdCounter = startTextIdCounter;
  const nextNodeId = () => `text-${++textIdCounter}`;

  const allTransclusions = [
    ...root.querySelectorAll('[typeof*="mw:Transclusion"]'),
  ];

  for (const el of allTransclusions) {
    if (!isOutermostTransclusion(el) || excludedElements?.has(el)) continue;

    const dataMw = readDataMw(el);
    const templateName = dataMw?.parts?.[0]?.template?.target?.wt;
    if (
      !dataMw ||
      !templateName ||
      !isAllowedTopLevelTemplateName(templateName)
    )
      continue;

    const params = dataMw.parts[0].template?.params ?? {};
    const paramNames = Object.keys(params);
    if (paramNames.length === 0) continue;

    let commitRef: () => void = () => {};
    const requestCommit = () => commitRef();

    const paramGetters = paramNames.map((name) => ({
      name,
      getValue: buildParamNode(
        name,
        params[name]?.wt ?? "",
        0,
        normalizeTemplateName(templateName),
        nextNodeId,
        (node, writer) => {
          textNodes.push(node);
          nodeElements.set(node.id, el);
          templateParamWriters.set(node.id, writer);
        },
        requestCommit,
        collectLinkTarget,
        templateLinkResolutions,
      ),
    }));

    commitRef = () => {
      const newParams: Record<string, { wt: string }> = {};
      for (const { name, getValue } of paramGetters) {
        newParams[name] = { wt: getValue() };
      }
      const fullDataMw = JSON.parse(
        (el as HTMLElement).dataset?.mw ?? el.getAttribute("data-mw") ?? "{}",
      ) as { parts: DataMwTemplatePart[] };
      if (fullDataMw.parts?.[0]?.template) {
        fullDataMw.parts[0].template.params = newParams;
      }
      el.setAttribute("data-mw", JSON.stringify(fullDataMw));
    };
  }

  return {
    result: { textNodes, nodeElements, templateParamWriters, linkTargets },
    nextTextIdCounter: textIdCounter,
  };
}
