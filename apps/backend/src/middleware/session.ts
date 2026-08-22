import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "@/honoTypes";
import { getSessionUser } from "@/services/sessionService";
import { BackendError } from "@/shared/errors";

export const sessionMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const sessionUser = await getSessionUser(c);

  if (!sessionUser) {
    throw new BackendError("AuthError", "Login required.");
  }

  c.set("sessionUser", sessionUser);
  await next();
};
