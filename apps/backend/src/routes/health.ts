import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "@/honoTypes";
import { healthResponse } from "@/schema/healthResponse";

export const healthRoute = new OpenAPIHono<AppEnv>();

const health = createRoute({
  method: "get",
  path: "/",
  tags: ["System"],
  summary: "Health check",
  description: "Returns the health status of the service.",
  responses: {
    200: {
      description: "Service is healthy.",
      content: {
        "application/json": {
          schema: healthResponse,
        },
      },
    },
  },
});

healthRoute.openapi(health, (c) => {
  return c.json({
    status: "ok",
  });
});
