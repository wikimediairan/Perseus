export const PIPELINE_STAGE_ORDER = [
  "load-article",
  "parse-with-parsoid",
  "resolve-wikidata-links",
  "extract-translatable-nodes",
  "chunking",
  "translation",
  "merge",
  "generate-wikitext",
] as const;

export type PipelineStageName = (typeof PIPELINE_STAGE_ORDER)[number];
