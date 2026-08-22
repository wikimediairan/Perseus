import { z } from "@hono/zod-openapi";

export const quotaResponse = z.object({
  weeklyLimitCost: z.number(),
  usedCost: z.number(),
  remainingCost: z.number(),
  resetsAt: z.iso.datetime(),
});
