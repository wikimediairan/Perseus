import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "@/honoTypes";
import { BackendError } from "@/shared/errors";

const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_REQUESTS_PER_WINDOW = 20;

function clientIp(c: Parameters<MiddlewareHandler<AppEnv>>[0]): string {
  return (
    c.req.header("CF-Connecting-IP") ??
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export function rateLimit(routeKey: string): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const windowStart = Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS;
    const bucketKey = `${clientIp(c)}:${routeKey}:${windowStart}`;

    const row = await c.env.DB.prepare(`
			INSERT INTO auth_rate_limits (bucket_key, count)
			VALUES (?, 1)
			ON CONFLICT(bucket_key) DO UPDATE SET count = count + 1
			RETURNING count
		`)
      .bind(bucketKey)
      .first<{ count: number }>();

    if ((row?.count ?? 0) > MAX_REQUESTS_PER_WINDOW) {
      throw new BackendError(
        "RateLimitError",
        "Too many requests. Please try again shortly.",
      );
    }

    await next();
  };
}
