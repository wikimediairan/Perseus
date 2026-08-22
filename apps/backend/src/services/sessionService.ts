import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppEnv } from "@/honoTypes";
import {
  createSession,
  deleteSession,
  findValidSession,
} from "@/repositories/sessionsRepo";
import { findUserById, type UserRow } from "@/repositories/usersRepo";
import { generateToken, sha256Hex } from "@/shared/tokens";

const SESSION_COOKIE = "perseus_session";
const OAUTH_STATE_COOKIE_PREFIX = "perseus_oauth_state_";

function isSecureRequest(c: Context<AppEnv>): boolean {
  return new URL(c.req.url).protocol === "https:";
}

/**
 * Creates a session row and returns its plaintext token, without
 * touching cookies -- the shared primitive behind both `startSession`
 * (browser cookie delivery) and the Desktop code-exchange flow (JSON
 * body delivery, see services/desktopAuth.ts). Same `sessions` table,
 * same hash-at-rest/expiry/revocation semantics either way -- only the
 * delivery transport differs.
 */
export async function issueSessionToken(
  db: D1Database,
  userId: string,
): Promise<string> {
  const token = generateToken(32);
  const tokenHash = await sha256Hex(token);
  await createSession(db, tokenHash, userId);
  return token;
}

export async function startSession(
  c: Context<AppEnv>,
  userId: string,
): Promise<void> {
  const token = await issueSessionToken(c.env.DB, userId);

  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecureRequest(c),
    sameSite: "Lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
}

/** Resolves a session token to its user, regardless of transport --
 * shared by cookie-based (`getSessionUser`) and bearer-token-based
 * (`middleware/auth.ts`) authentication so both go through the exact
 * same validation. */
export async function resolveSessionToken(
  db: D1Database,
  token: string,
): Promise<UserRow | null> {
  const tokenHash = await sha256Hex(token);
  const session = await findValidSession(db, tokenHash);
  if (!session) return null;

  return await findUserById(db, session.userId);
}

export async function getSessionUser(
  c: Context<AppEnv>,
): Promise<UserRow | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;

  return await resolveSessionToken(c.env.DB, token);
}

export async function endSession(c: Context<AppEnv>): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const tokenHash = await sha256Hex(token);
    await deleteSession(c.env.DB, tokenHash);
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

/** Sets a short-lived, httpOnly "double submit" cookie holding the OAuth
 * state, so the callback can verify it against the ?state= query param. */
export function startOAuthState(c: Context<AppEnv>, provider: string): string {
  const state = generateToken(16);
  setCookie(c, `${OAUTH_STATE_COOKIE_PREFIX}${provider}`, state, {
    httpOnly: true,
    secure: isSecureRequest(c),
    sameSite: "Lax",
    path: "/",
    maxAge: 600,
  });
  return state;
}

export function consumeOAuthState(
  c: Context<AppEnv>,
  provider: string,
): string | undefined {
  const cookieName = `${OAUTH_STATE_COOKIE_PREFIX}${provider}`;
  const value = getCookie(c, cookieName);
  deleteCookie(c, cookieName, { path: "/" });
  return value;
}

const OAUTH_DESKTOP_REDIRECT_COOKIE_PREFIX = "perseus_oauth_desktop_redirect_";

/** Carries the Desktop client's loopback/deep-link redirect URI through
 * the Wikimedia OAuth round trip, the same short-lived-cookie way
 * `startOAuthState`/`consumeOAuthState` carry `state`. Only ever set
 * when `GET /auth/wikimedia` was given a validated `desktopRedirect`
 * (see routes/auth.ts) -- absent for a normal browser login. */
export function startOAuthDesktopRedirect(
  c: Context<AppEnv>,
  provider: string,
  redirectUri: string,
): void {
  setCookie(
    c,
    `${OAUTH_DESKTOP_REDIRECT_COOKIE_PREFIX}${provider}`,
    redirectUri,
    {
      httpOnly: true,
      secure: isSecureRequest(c),
      sameSite: "Lax",
      path: "/",
      maxAge: 600,
    },
  );
}

export function consumeOAuthDesktopRedirect(
  c: Context<AppEnv>,
  provider: string,
): string | undefined {
  const cookieName = `${OAUTH_DESKTOP_REDIRECT_COOKIE_PREFIX}${provider}`;
  const value = getCookie(c, cookieName);
  deleteCookie(c, cookieName, { path: "/" });
  return value;
}
