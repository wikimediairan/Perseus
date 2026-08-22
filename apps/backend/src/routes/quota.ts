import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "@/honoTypes";
import { getQuotaStatus } from "@/repositories/quota";
import { quotaResponse } from "@/schema/quotaResponse";

export const quotaRoute = new OpenAPIHono<AppEnv>();

const getQuota = createRoute({
  method: "get",
  path: "/",
  security: [{ bearerAuth: [] }],
  summary: "Get current API quota",
  description: "Returns the authenticated user's current weekly quota usage.",
  tags: ["Quota"],
  responses: {
    200: {
      description: "Quota information",
      content: {
        "application/json": {
          schema: quotaResponse,
        },
      },
    },
  },
});

quotaRoute.openapi(getQuota, async (c) => {
  const user = c.get("sessionUser");
  const status = await getQuotaStatus(c.env.DB, user.id, user.weeklyCredit);

  return c.json({
    weeklyLimitCost: status.weeklyLimitCost,
    usedCost: status.costUsed,
    remainingCost: status.remainingCost,
    resetsAt: status.resetsAt,
  });
});
