import { z } from "zod";

export const sessionIdSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    "Expected a session UUID returned by create_translation",
  );
export const chunkIdSchema = z.string().regex(/^chunk-[1-9]\d{0,5}$/);
export const targetSchema = z.enum(["fa", "tj"]);
export const contentSchema = z.string().min(1).max(100_000);
export const versionSchema = z.number().int().nonnegative();
const resolutionSchema = z
  .object({
    id: z.string().max(100),
    resolvedTarget: z.string().max(10_000).nullable(),
    href: z.string().max(30_000).startsWith("./").nullable(),
  })
  .strict();

export const sourceSchema = z
  .object({
    wiki: z.literal("enwiki"),
    pageId: z.number().int().positive(),
    revisionId: z.number().int().positive(),
    title: z.string().min(1).max(10_000),
  })
  .strict();
export const snapshotSchema = z
  .object({
    html: z.string().max(10_000_000),
    rawWikitext: z.string().max(10_000_000),
    links: z.array(resolutionSchema).max(100_000),
    categories: z.array(resolutionSchema).max(100_000),
    templateLinks: z
      .array(
        z.tuple([
          z.string().max(10_000),
          z
            .object({
              resolvedTarget: z.string().max(10_000).nullable(),
              fallbackTemplateName: z.string().max(1000).nullable(),
            })
            .strict(),
        ]),
      )
      .max(100_000),
  })
  .strict();
export type ArticleSnapshot = z.infer<typeof snapshotSchema>;

export const chunkSchema = z
  .object({
    id: chunkIdSchema,
    units: z
      .array(
        z
          .object({
            nodeId: z.string().regex(/^text-\d+$/),
            sourceText: z.string().max(32_000),
          })
          .strict(),
      )
      .min(1)
      .max(10_000),
    version: versionSchema,
    accepted: contentSchema.nullable(),
    lastSubmission: z
      .object({ version: versionSchema, replace: z.boolean() })
      .strict()
      .nullable(),
    validationProblems: z.array(z.string().max(1000)).max(10),
  })
  .strict();
export const sessionSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: sessionIdSchema,
    sourceUrl: z.string().max(20_000),
    source: sourceSchema,
    targetLanguage: targetSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    snapshot: snapshotSchema,
    chunks: z.array(chunkSchema).max(10_000),
    warnings: z.array(z.string().max(500)).max(20),
  })
  .strict();
export type SavedSession = z.infer<typeof sessionSchema>;
export type SavedChunk = SavedSession["chunks"][number];
