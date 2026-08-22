/**
 * useWikimediaSession.ts
 *
 * Top-level auth state for the "Wikimedia" provider (i.e. Perseus
 * Backend access) -- replaces the old model where possessing an API
 * key string was treated as sufficient for access. This hook reflects
 * the Backend's actual authorization decision (active / pending /
 * rejected / disabled / not-logged-in), not just "do we have a token
 * stored."
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  checkSession,
  getStoredToken,
  login as loginToBackend,
  logout as logoutFromBackend,
  onSessionExpired,
  type SessionStatus,
} from "@/services/SessionAuth";

export type WikimediaSessionState =
  | { phase: "loading" }
  | { phase: "signed-out" }
  | { phase: "signing-in" }
  | {
      phase: "signed-in";
      token: string;
      access:
        | {
            kind: "active";
            quota: Extract<SessionStatus, { kind: "active" }>["quota"];
          }
        | { kind: "restricted"; userStatus: string };
    }
  | { phase: "error"; message: string };

export function useWikimediaSession() {
  const [state, setState] = useState<WikimediaSessionState>({
    phase: "loading",
  });
  // Lets `refresh` (called from anywhere, e.g. after a 401 from a
  // translate call) always act on the latest token without depending
  // on `state` itself, which would otherwise force this callback's
  // identity to change every render.
  const tokenRef = useRef<string | undefined>(undefined);

  const applyStatus = useCallback((token: string, status: SessionStatus) => {
    if (status.kind === "active") {
      tokenRef.current = token;
      setState({
        phase: "signed-in",
        token,
        access: { kind: "active", quota: status.quota },
      });
      return;
    }

    if (status.kind === "restricted") {
      tokenRef.current = token;
      setState({
        phase: "signed-in",
        token,
        access: { kind: "restricted", userStatus: status.userStatus },
      });
      return;
    }

    // "unauthenticated" (expired/invalid/revoked) or a transient
    // "error" both drop the local token and return to signed-out --
    // never silently keep using a token the Backend just rejected, and
    // never fall back to any other credential.
    tokenRef.current = undefined;
    setState({ phase: "signed-out" });
  }, []);

  const refresh = useCallback(async () => {
    const token = tokenRef.current ?? (await getStoredToken());
    if (!token) {
      setState({ phase: "signed-out" });
      return;
    }

    const status = await checkSession(token);
    applyStatus(token, status);
  }, [applyStatus]);

  useEffect(() => {
    void refresh();
    // Runs once on mount to restore a previous session, matching the
    // "restart app -> existing session is restored" requirement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  useEffect(() => {
    return onSessionExpired(() => {
      tokenRef.current = undefined;
      setState({ phase: "signed-out" });
    });
  }, []);

  const login = useCallback(async () => {
    setState({ phase: "signing-in" });
    try {
      const token = await loginToBackend();
      const status = await checkSession(token);
      applyStatus(token, status);
    } catch (err) {
      setState({
        phase: "error",
        message: err instanceof Error ? err.message : "Sign-in failed.",
      });
    }
  }, [applyStatus]);

  const logout = useCallback(async () => {
    await logoutFromBackend();
    tokenRef.current = undefined;
    setState({ phase: "signed-out" });
  }, []);

  return { state, login, logout, refresh };
}
