import { DOMParser } from "linkedom";

(globalThis as unknown as { DOMParser: typeof DOMParser }).DOMParser = DOMParser;
