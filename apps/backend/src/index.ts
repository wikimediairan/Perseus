import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import type { Env } from "@/config/env";
import type { AppEnv } from "@/honoTypes";
import { authMiddleware, requireActiveUser } from "@/middleware/auth";
import { corsMiddleware } from "@/middleware/cors";
import { errorHandler } from "@/middleware/errorHandler";
import { quotaMiddleware } from "@/middleware/quota";
import { rateLimit } from "@/middleware/rateLimit";
import { requestIdMiddleware } from "@/middleware/requestId";
import { adminRoute } from "@/routes/admin";
import { authRoute } from "@/routes/auth";
import { healthRoute } from "@/routes/health";
import { quotaRoute } from "@/routes/quota";
import { translateRoute } from "@/routes/translate";
import { adminWebRoute } from "@/routes/web/admin";
import { dashboardRoute } from "@/routes/web/dashboard";
import { homeRoute } from "@/routes/web/home";
import { handleWeeklyEvaluation } from "@/services/weeklyEvaluation";

const app = new OpenAPIHono<AppEnv>();

app.onError(errorHandler);

app.use("*", corsMiddleware);
app.use("*", requestIdMiddleware);

app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "Perseus session token",
  description:
    "A Perseus session token (see POST /auth/desktop/token), not a Wikimedia credential.",
});

app.doc("/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "Perseus Backend API",
    version: "0.2.0",
  },
});

app.get(
  "/docs",
  Scalar({
    url: "/openapi.json",
  }),
);

app.route("/", homeRoute);

app.route("/v1/health", healthRoute);

app.use("/v1/translate", authMiddleware, requireActiveUser, quotaMiddleware);
app.route("/v1/translate", translateRoute);

app.use("/v1/quota", authMiddleware, requireActiveUser);
app.route("/v1/quota", quotaRoute);

app.use("/auth/*", rateLimit("auth"));
app.route("/auth", authRoute);

app.route("/dashboard", dashboardRoute);

app.route("/admin", adminWebRoute);
app.route("/api/admin", adminRoute);

export default Object.assign(app, {
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await handleWeeklyEvaluation(env);
  },
});
