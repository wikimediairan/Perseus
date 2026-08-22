import { Hono } from "hono";
import type { AppEnv } from "@/honoTypes";
import { sessionMiddleware } from "@/middleware/session";
import { requestAccessReview } from "@/services/creditEngine";
import { getDashboardUsage } from "@/services/usageService";
import { RequestLogger } from "@/shared/logger";
import { DashboardPage } from "@/views/pages/DashboardPage";

export const dashboardRoute = new Hono<AppEnv>();

dashboardRoute.get("/", sessionMiddleware, async (c) => {
  const user = c.get("sessionUser");
  const requestId = c.get("requestId") ?? "unknown";
  const logger = new RequestLogger(requestId);

  const reviewRequest =
    c.req.query("reviewRequested") === "true"
      ? "success"
      : c.req.query("reviewRequested") === "false"
        ? "error"
        : null;

  try {
    const usage =
      user.status === "active" ? await getDashboardUsage(c.env.DB, user) : null;

    const page = DashboardPage({
      wikimediaUsername: user.wikimediaUsername ?? "(ناشناس)",
      status: user.status,
      usage,
      reviewRequest,
      loadError: false,
    });

    return c.html(`<!doctype html>${page.toString()}`);
  } catch (err) {
    // A DB read failed while building the dashboard -- degrade to a
    // plain, still-branded error state instead of letting the global
    // JSON error handler render a raw API error envelope on an HTML
    // page (see src/middleware/errorHandler.ts, which always returns
    // c.json(...) and has no notion of "this route renders HTML").
    logger.error("Failed to load dashboard", {
      message: err instanceof Error ? err.message : String(err),
    });

    const page = DashboardPage({
      wikimediaUsername: user.wikimediaUsername ?? "(ناشناس)",
      status: user.status,
      usage: null,
      reviewRequest,
      loadError: true,
    });

    return c.html(`<!doctype html>${page.toString()}`, 200);
  }
});

/**
 * Self-service "request another review" for a `rejected` user -- the
 * entire access-request flow now that api_keys/key_requests are gone
 * (see migration 0002_remove_api_keys.sql and
 * creditEngine.requestAccessReview). Plain form-POST-and-redirect, the
 * same pattern as /auth/logout -- no htmx is loaded anywhere in this
 * app (see views/layouts/Layout.tsx).
 */
dashboardRoute.post("/request-review", sessionMiddleware, async (c) => {
  const user = c.get("sessionUser");

  try {
    await requestAccessReview(c.env.DB, user.id);
    return c.redirect("/dashboard?reviewRequested=true");
  } catch {
    return c.redirect("/dashboard?reviewRequested=false");
  }
});
