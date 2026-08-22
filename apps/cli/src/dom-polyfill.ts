/**
 * dom-polyfill
 *
 * Perseus Desktop's Core keeps Parsoid's own HTML alive as the IR's
 * structural backbone (see core/ir/IntermediateRepresentation.ts) and
 * therefore uses browser DOM globals directly — `DOMParser`, `Element`,
 * `Document`, `Node` — which normally only exist inside Electron/Tauri's
 * webview or a real browser. This CLI runs in plain Node, so this module
 * installs a minimal, spec-compliant DOM implementation (linkedom) onto
 * `globalThis` before any Core module that touches the DOM is imported.
 *
 * This is the ONLY change required to make Core's parsing/merge/
 * generation stages run headlessly: the stages themselves are untouched.
 * Must be imported first, before any `../*` module that uses DOM
 * globals (ParsoidParser, Merger, WikitextGenerator, IntermediateRepresentation).
 */
import { DOMParser, Document, Element, Node } from "linkedom";

declare global {
  // eslint-disable-next-line no-var
  var __PERSEUS_CLI_DOM_POLYFILLED__: boolean | undefined;
}

export function installDomPolyfill(): void {
  if (globalThis.__PERSEUS_CLI_DOM_POLYFILLED__) {
    return;
  }

  // linkedom's DOMParser.parseFromString accepts the same
  // (markup, mimeType) signature the browser's DOMParser does, which is
  // exactly what ParsoidParser.ts calls — no shim needed beyond exposing it.
  (globalThis as unknown as { DOMParser: unknown }).DOMParser = DOMParser;
  (globalThis as unknown as { Document: unknown }).Document = Document;
  (globalThis as unknown as { Element: unknown }).Element = Element;
  (globalThis as unknown as { Node: unknown }).Node = Node;

  globalThis.__PERSEUS_CLI_DOM_POLYFILLED__ = true;
}
