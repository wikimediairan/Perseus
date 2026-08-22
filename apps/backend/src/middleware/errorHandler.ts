import type { ErrorHandler } from "hono";
import type { AppEnv } from "@/honoTypes";
import { toHttpError } from "@/shared/errors";
import { RequestLogger } from "@/shared/logger";

export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  const requestId = c.get("requestId") ?? "unknown";
  const { status, body, logContext } = toHttpError(err, requestId);

  const logger = new RequestLogger(requestId);
  logger.error(err instanceof Error ? err.message : "Unhandled error", {
    category: body.error.category,
    status,
    ...logContext,
  });

  return c.json(body, status as 400 | 401 | 403 | 404 | 409 | 429 | 500 | 502);
};
