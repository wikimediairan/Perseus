/**
 * Perseus Core keeps Parsoid's DOM alive as its structural backbone and calls
 * the browser DOM globals directly. Toolforge runs plain Node, so install
 * linkedom before any Core module is evaluated.
 */
import { DOMParser, Document, Element, Node } from "linkedom";

const globalScope = globalThis as Record<string, unknown>;
globalScope.DOMParser = DOMParser;
globalScope.Document = Document;
globalScope.Element = Element;
globalScope.Node = Node;
