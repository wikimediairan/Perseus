import { z } from "@hono/zod-openapi";
import { SOURCE_WIKI_CODE } from "@perseus/core";

export const translateRequest = z.object({
  source: z.object({
    wiki: z.literal(SOURCE_WIKI_CODE),
    pageId: z.number().int().positive(),
    revisionId: z.number().int().positive(),
  }),
  chunk: z.string().min(1),
  targetWiki: z.string().min(1),
  model: z.string().min(1),
});
