import { z } from "@hono/zod-openapi";

const articleSourceRefSchema = z.object({
  wiki: z.string(),
  pageId: z.number().int().positive(),
  revisionId: z.number().int().positive(),
});

const translatedUnitSchema = z.object({
  nodeId: z.string(),
  sourceText: z.string(),
  translatedText: z.string(),
});

const translatedChunkSchema = z.object({
  chunkId: z.string(),
  units: z.array(translatedUnitSchema),
});

const failedChunkSchema = z.object({
  chunkId: z.string(),
  reason: z.literal("provider_error"),
});

const skippedChunkSchema = z.object({
  chunkId: z.string(),
  reason: z.literal("quota_exhausted"),
});

export const translateResponse = z.object({
  source: articleSourceRefSchema,
  targetWiki: z.enum(["fa", "tj"]),
  totalChunks: z.number().int().positive(),
  translated: z.array(translatedChunkSchema),
  failed: z.array(failedChunkSchema),
  skipped: z.array(skippedChunkSchema),
  quota: z.object({
    remainingCost: z.number().nonnegative(),
    resetsAt: z.iso.datetime(),
  }),
});
