/**
 * desktopAuth.ts
 *
 * The Backend-side half of a loopback-redirect OAuth flow for the
 * (not-yet-built) Desktop client -- the standard pattern CLI/desktop
 * tools use to authenticate through a system browser without ever
 * handling the identity provider's own credentials themselves (the
 * same shape as `gcloud auth login`, the GitHub CLI, etc.):
 *
 *   1. Desktop starts a local HTTP listener on 127.0.0.1:<port> and
 *      opens the system browser at
 *      GET /auth/wikimedia?desktopRedirect=http://127.0.0.1:<port>/callback
 *   2. The user completes the *exact same* Wikimedia OAuth flow as a
 *      normal browser login (routes/auth.ts is unchanged for that
 *      part) -- Desktop never sees Wikimedia's token.
 *   3. Instead of redirecting to /dashboard, the callback mints a
 *      short-lived, single-use code and redirects the browser to
 *      Desktop's own loopback listener with it.
 *   4. Desktop immediately exchanges that code, server-to-server, for
 *      a normal Perseus session token (`POST /auth/desktop/token`) --
 *      identical `sessions` row, expiry, and revocation semantics as a
 *      browser session; only the delivery differs (JSON body instead
 *      of a cookie). Desktop then sends that token as
 *      `Authorization: Bearer <token>` on protected API requests (see
 *      middleware/auth.ts).
 *
 * No new permanent credential is introduced anywhere in this flow --
 * the code dies in minutes (used at most once), and the token it
 * produces is a session like any other, not a new credential type.
 */
import {
  createDesktopAuthCode,
  redeemDesktopAuthCode,
} from "@/repositories/desktopAuthCodesRepo";
import { issueSessionToken } from "@/services/sessionService";
import { BackendError } from "@/shared/errors";
import { generateToken, sha256Hex } from "@/shared/tokens";

const CODE_TTL_MS = 2 * 60 * 1000; // 2 minutes -- long enough for a redirect round trip, short enough to bound the exposure window of a code appearing in a URL.

/**
 * Loopback addresses and a fixed custom scheme are the only redirect
 * targets accepted -- anything else would turn this endpoint into an
 * open redirect that could hand the one-time code to an
 * attacker-controlled origin. This is deliberately a strict allow-list,
 * not a "looks safe" heuristic.
 */
export function isAllowedDesktopRedirect(redirectUri: string): boolean {
  try {
    const url = new URL(redirectUri);

    if (url.protocol === "perseus:") return true;

    if (url.protocol !== "http:") return false;
    return url.hostname === "127.0.0.1" || url.hostname === "localhost";
  } catch {
    return false;
  }
}

export async function issueDesktopAuthCode(
  db: D1Database,
  userId: string,
): Promise<string> {
  const code = generateToken(32);
  const codeHash = await sha256Hex(code);
  await createDesktopAuthCode(db, codeHash, userId, CODE_TTL_MS);
  return code;
}

/** Exchanges a one-time code for a real Perseus session token. Throws if
 * the code is unknown, already used, or expired -- all three look
 * identical to the caller, so a guesser learns nothing from the
 * response about which case occurred. */
export async function exchangeDesktopAuthCode(
  db: D1Database,
  plaintextCode: string,
): Promise<{ token: string; userId: string }> {
  const codeHash = await sha256Hex(plaintextCode);
  const record = await redeemDesktopAuthCode(db, codeHash);

  if (!record) {
    throw new BackendError(
      "AuthError",
      "This authorization code is invalid, expired, or already used.",
    );
  }

  const token = await issueSessionToken(db, record.userId);
  return { token, userId: record.userId };
}
