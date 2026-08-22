import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "@/honoTypes";
import { isAdmin } from "@/repositories/adminsRepo";
import { getSessionUser } from "@/services/sessionService";
import { BackendError } from "@/shared/errors";

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const sessionUser = c.get("sessionUser") ?? (await getSessionUser(c));

  if (!sessionUser) {
    throw new BackendError("AuthError", "Login required.");
  }

  if (!(await isAdmin(c.env.DB, sessionUser.id))) {
    throw new BackendError(
      "ForbiddenError",
      "This action requires administrator access.",
    );
  }

  c.set("sessionUser", sessionUser);
  await next();
};
