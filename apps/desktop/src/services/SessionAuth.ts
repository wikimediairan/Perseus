/**
 * SessionAuth.ts
 *
 * Replaces the old model where the user pasted a Perseus API key into
 * the Wikimedia provider's settings field. Desktop now authenticates
 * via Wikimedia OAuth + a Backend session token, obtained through the
 * Backend's loopback-redirect flow (see src-tauri/src/oauth.rs for the
 * local callback listener) and stored via the OS keychain (see
 * src-tauri/src/session.rs) -- never in `perseus.config.json` (see
 * services/ConfigLoader.ts) and never logged.
 *
 * This is the single place that knows the session token exists and
 * where it lives; everything else (ProviderCard, the translation
 * pipeline) goes through `useWikimediaSession`/`checkSession` rather
 * than touching storage directly.
 */
import { invoke } from "@tauri-apps/api/core";
import { PERSEUS_BACKEND_BASE_URL } from "@/services/backendConfig";

export interface DesktopTokenExchangeResponse {
  token: string;
  tokenType: string;
}

/**
 * Runs the full login flow: opens the system browser to Wikimedia OAuth
 * via a Rust-side loopback listener, receives the one-time code,
 * exchanges it for a session token, and persists that token securely.
 * Returns the token so the caller can use it immediately without a
 * second keychain round trip.
 */
export async function login(): Promise<string> {
  const code = await invoke<string>("login_with_wikimedia", {
    backendBaseUrl: PERSEUS_BACKEND_BASE_URL,
  });

  const response = await fetch(
    new URL("/auth/desktop/token", PERSEUS_BACKEND_BASE_URL),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    },
  );

  if (!response.ok) {
    throw new Error(
      "Could not complete sign-in. The authorization code may have expired -- please try again.",
    );
  }

  const body = (await response.json()) as DesktopTokenExchangeResponse;
  await invoke("store_session_token", { token: body.token });
  return body.token;
}

/** Reads the persisted session token, if any -- used on app startup to
 * restore a previous login without re-authenticating. */
export async function getStoredToken(): Promise<string | undefined> {
  const token = await invoke<string | null>("get_session_token");
  return token ?? undefined;
}

export type SessionStatus =
  | { kind: "unauthenticated" }
  | { kind: "active"; quota: BackendQuota }
  | {
      kind: "restricted";
      userStatus: "pending" | "rejected" | "disabled" | "unknown";
    }
  | { kind: "error" };

interface BackendQuota {
  weeklyLimitCost: number;
  usedCost: number;
  remainingCost: number;
  resetsAt: string;
}

interface BackendErrorBody {
  error?: { category?: string; message?: string };
}

/**
 * Determines what the current token is actually authorized to do.
 *
 * The Backend does not currently expose a lightweight "who am I / what
 * is my status" endpoint gated only by authentication (not also by
 * `requireActiveUser`) -- see the migration report. `GET /v1/quota` is
 * used as a proxy: a 200 confirms `active`, a 401 means the token is
 * missing/invalid/expired, and a 403's `ForbiddenError` message (which
 * happens to be phrased as "Your account is <status> and does not have
 * access...") is pattern-matched for the known status words as an
 * interim measure. This is explicitly a workaround, not a stable
 * contract -- it will silently degrade to "unknown" if the Backend ever
 * rewords that message, which is exactly why a dedicated endpoint would
 * be the correct long-term fix.
 */
export async function checkSession(token: string): Promise<SessionStatus> {
  let response: Response;

  try {
    response = await fetch(new URL("/v1/quota", PERSEUS_BACKEND_BASE_URL), {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return { kind: "error" };
  }

  if (response.status === 401) {
    return { kind: "unauthenticated" };
  }

  if (response.ok) {
    const quota = (await response.json()) as BackendQuota;
    return { kind: "active", quota };
  }

  if (response.status === 403) {
    const body = (await response.json().catch(() => ({}))) as BackendErrorBody;
    const message = body.error?.message ?? "";
    const userStatus = (["pending", "rejected", "disabled"] as const).find(
      (s) => message.includes(s),
    );
    return { kind: "restricted", userStatus: userStatus ?? "unknown" };
  }

  return { kind: "error" };
}

/**
 * True for the specific case that should force the user back to the
 * login screen: the token itself is no longer valid (expired, revoked,
 * or malformed) -- as opposed to `restricted`, where the user is
 * correctly authenticated but not yet authorized. Callers must not
 * treat those two the same way (see this task's "session expiry" vs
 * "user status" requirements).
 */
export function isSessionExpired(status: SessionStatus): boolean {
  return status.kind === "unauthenticated";
}

const SESSION_EXPIRED_EVENT = "perseus:wikimedia-session-expired";

/**
 * Called when a translate/quota call comes back 401 mid-session (see
 * useChunkWorkspace/index.ts) -- clears the stored token and notifies
 * any mounted `useWikimediaSession` instance immediately, rather than
 * waiting for its next natural refresh (e.g. the next app restart).
 * A plain DOM event is enough here: there is exactly one consumer
 * (WikimediaAuthField) and this avoids threading a callback through
 * three layers of hooks (useTranslationSession /
 * useChunkTranslationActions / useWikitextOutput) that otherwise have
 * no reason to know the session hook exists.
 */
export async function notifySessionExpired(): Promise<void> {
  await invoke("clear_session_token").catch(() => undefined);
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
}

export function onSessionExpired(handler: () => void): () => void {
  window.addEventListener(SESSION_EXPIRED_EVENT, handler);
  return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler);
}

/**
 * Best-effort server-side session invalidation, then always clears the
 * local token regardless of whether the server call succeeded --
 * losing network connectivity must never prevent a local logout.
 *
 * NOTE: the Backend's existing `POST /auth/logout` currently reads the
 * session token from a browser cookie, which Desktop never has (its
 * token is delivered once as a JSON response body and sent back as
 * `Authorization: Bearer`, deliberately never as a cookie -- see
 * routes/auth.ts on the Backend). So this call cannot currently revoke
 * the session server-side for a Desktop-originated login; it is a
 * client-side-only logout until the Backend exposes a bearer-aware
 * revocation endpoint. See the migration report for detail -- this is
 * the one incompatibility this task turned up that genuinely can't be
 * resolved from Desktop alone, and per this task's scope this was
 * reported rather than "fixed" by redesigning the Backend.
 */
export async function logout(): Promise<void> {
  try {
    const token = await getStoredToken();
    if (token) {
      await fetch(new URL("/auth/logout", PERSEUS_BACKEND_BASE_URL), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  } catch {
    // Best-effort only -- see note above.
  } finally {
    await invoke("clear_session_token");
  }
}
