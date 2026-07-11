/**
 * PipelineStage
 *
 * Shared vocabulary for pipeline stage identity, used by Logger (stage
 * attribution), PerseusError (stage attribution), and Pipeline
 * (orchestration order). Keeping this list in one place avoids the stage
 * names drifting between logging, error handling, and orchestration.
 *
 * Order matches Software Specification, Section 7, exactly.
 */
export const PIPELINE_STAGE_ORDER = [
  'load-article',
  'parse-with-parsoid',
  'resolve-wikidata-links',
  'extract-translatable-nodes',
  'chunking',
  'llm-translation',
  'merge',
  'generate-wikitext',
] as const;

export type PipelineStageName = (typeof PIPELINE_STAGE_ORDER)[number];
