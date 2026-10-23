import { z } from "@hono/zod-openapi";
import { isWikipediaWikiCode } from "@perseus/core";

export const translateRequest = z.object({
  source: z.object({
    wiki: z
      .string()
      .refine(isWikipediaWikiCode, "Expected a Wikipedia site code."),
    pageId: z.number().int().positive(),
    revisionId: z.number().int().positive(),
  }),
  chunk: z.string().min(1),
  targetWiki: z.string().min(1),
  model: z.string().min(1),
});
