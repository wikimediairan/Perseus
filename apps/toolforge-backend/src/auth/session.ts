import type { Store } from "../db/store.js";
import type { UserRecord } from "../domain/types.js";
import { ApiError } from "../util/errors.js";
import { newToken, sha256 } from "../util/ids.js";
import { addDays } from "../util/time.js";

export interface IssuedSession {
  token: string;
  expiresAt: string;
}

export async function issueSession(
  store: Store,
  userId: string,
  ttlDays: number,
): Promise<IssuedSession> {
  const token = newToken("ps", 32);
  const expiresAt = addDays(new Date(), ttlDays);
  await store.createSession(userId, sha256(token), expiresAt);
  return { token, expiresAt: expiresAt.toISOString() };
}

export function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

export async function authenticate(
  store: Store,
  authorization: string | undefined,
): Promise<{ user: UserRecord; expiresAt: string }> {
  const token = bearerToken(authorization);
  if (!token) {
    throw new ApiError(401, "AUTH_REQUIRED", "A bearer token is required.");
  }

  const session = await store.findSession(sha256(token));
  if (!session) {
    throw new ApiError(
      401,
      "INVALID_SESSION",
      "The session is invalid or has expired.",
    );
  }
  return session;
}
