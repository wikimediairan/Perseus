import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "@/honoTypes";
import { resolveSessionToken } from "@/services/sessionService";
import { BackendError } from "@/shared/errors";

/**
 * Authenticates protected API routes (`/v1/translate`, `/v1/quota`)
 * through the same Perseus session mechanism as the browser dashboard
 * -- just delivered as `Authorization: Bearer <session-token>` instead
 * of a cookie, since these are pure JSON endpoints a non-browser client
 * (Desktop, once it exists) calls directly. No separate credential
 * type or lookup exists anymore -- `resolveSessionToken` is the exact
 * same `sessions` table validation `getSessionUser` (cookie path) uses.
 *
 * Authorization (is this user *allowed* to use the service right now)
 * is deliberately a separate check, not folded in here -- see
 * `requireActiveUser` below -- so "not logged in" (401) and "logged in
 * but pending/rejected/disabled" (403) stay distinguishable, and so a
 * route that only needs identity (none currently, but plausible) isn't
 * forced through the active-status gate.
 */
export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header("Authorization");
  const token = header?.startsWith("Bearer ")
    ? header.slice("Bearer ".length).trim()
    : undefined;

  if (!token) {
    throw new BackendError(
      "AuthError",
      "Missing or malformed Authorization header.",
    );
  }

  const user = await resolveSessionToken(c.env.DB, token);

  if (!user) {
    throw new BackendError("AuthError", "Invalid or expired session token.");
  }

  c.set("sessionUser", user);
  await next();
};

/**
 * Authorization gate for protected service operations. A valid session
 * alone is not enough -- `disabled` users must be rejected even with an
 * otherwise-valid session (this is checked on every request, not just
 * at login, so a session that was valid an hour ago is re-checked
 * against the user's *current* status). `pending` and `rejected` are
 * denied the same way; only `active` passes.
 */
export const requireActiveUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get("sessionUser");

  if (user.status !== "active") {
    throw new BackendError(
      "ForbiddenError",
      `Your account is ${user.status} and does not have access to this functionality.`,
    );
  }

  await next();
};
