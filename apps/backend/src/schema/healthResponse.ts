import { z } from "@hono/zod-openapi";

export const healthResponse = z.object({
  status: z.literal("ok"),
});
