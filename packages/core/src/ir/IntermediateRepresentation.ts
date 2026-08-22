import type { CategoryNode } from "./CategoryNode";
import type { CitationId, CitationRegistry } from "./citation";
import type { LinkNode } from "./LinkNode";
import type { TemplateLinkResolution } from "./wikitextLinkUtils";

export interface TextNode {
  id: string;

  text: string;
}

export interface PlaceholderSpan {
  id: number;
  tag: string;

  element?: Element;

  verbatimHtml?: string;

  citationId?: CitationId;

  verbatim?: boolean;
}

export interface IRStructure {
  document: Document;

  nodeElements: Map<string, Element>;

  placeholders: Map<string, PlaceholderSpan[]>;

  linkElements: Map<string, Element>;

  categoryElements: Map<string, Element>;

  templateParamWriters: Map<string, (translatedText: string) => void>;

  templateLinkTargets: string[];

  templateLinkResolutions: Map<string, TemplateLinkResolution>;
}

export interface IntermediateRepresentation {
  sourceTitle: string;
  links: LinkNode[];

  categories: CategoryNode[];
  textNodes: TextNode[];

  citations: CitationRegistry;
  structure: IRStructure;
}
