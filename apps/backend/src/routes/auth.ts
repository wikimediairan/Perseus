import { type Context, Hono } from "hono";
import type { Env } from "@/config/env";
import type { AppEnv } from "@/honoTypes";
import { upsertWikimediaUser } from "@/repositories/usersRepo";
import {
  exchangeDesktopAuthCode,
  isAllowedDesktopRedirect,
  issueDesktopAuthCode,
} from "@/services/desktopAuth";
import {
  consumeOAuthDesktopRedirect,
  consumeOAuthState,
  endSession,
  startOAuthDesktopRedirect,
  startOAuthState,
  startSession,
} from "@/services/sessionService";
import {
  buildWikimediaAuthorizeUrl,
  exchangeWikimediaCode,
  fetchWikimediaProfile,
} from "@/services/wikimediaOAuth";
import { BackendError, PerseusError } from "@/shared/errors";

export const authRoute = new Hono<AppEnv>();

function redirectUri(c: Context<AppEnv>, path: string): string {
  const base = c.env.PUBLIC_BASE_URL || new URL(c.req.url).origin;
  return new URL(path, base).toString();
}

function requireWikimediaOAuthConfig(env: Env): void {
  if (!env.WIKIMEDIA_CONSUMER_KEY || !env.WIKIMEDIA_CONSUMER_SECRET) {
    throw new PerseusError(
      "ConfigurationError",
      "Wikimedia OAuth is not configured (missing WIKIMEDIA_CONSUMER_KEY/WIKIMEDIA_CONSUMER_SECRET).",
    );
  }
}

authRoute.get("/wikimedia", async (c) => {
  requireWikimediaOAuthConfig(c.env);

  const state = startOAuthState(c, "wikimedia");

  // Desktop-flow opt-in: see services/desktopAuth.ts for the full
  // rationale. Absent for a normal browser login -- everything below
  // behaves exactly as before in that case.
  const desktopRedirect = c.req.query("desktopRedirect");
  if (desktopRedirect) {
    if (!isAllowedDesktopRedirect(desktopRedirect)) {
      throw new PerseusError(
        "InputError",
        "desktopRedirect must be a loopback (127.0.0.1/localhost) or perseus:// URI.",
      );
    }
    startOAuthDesktopRedirect(c, "wikimedia", desktopRedirect);
  }

  const url = buildWikimediaAuthorizeUrl(
    c.env,
    state,
    redirectUri(c, "/auth/wikimedia/callback"),
  );
  return c.redirect(url);
});

authRoute.get("/wikimedia/callback", async (c) => {
  requireWikimediaOAuthConfig(c.env);

  const code = c.req.query("code");
  const state = c.req.query("state");
  const expectedState = consumeOAuthState(c, "wikimedia");
  const desktopRedirect = consumeOAuthDesktopRedirect(c, "wikimedia");

  if (!code || !state || !expectedState || state !== expectedState) {
    throw new BackendError("AuthError", "Invalid or expired OAuth state.");
  }

  const accessToken = await exchangeWikimediaCode(
    c.env,
    code,
    redirectUri(c, "/auth/wikimedia/callback"),
  );
  const profile = await fetchWikimediaProfile(accessToken);

  const user = await upsertWikimediaUser(c.env.DB, {
    wikimediaUserId: profile.wikimediaUserId,
    wikimediaUsername: profile.wikimediaUsername,
  });

  // The browser is genuinely logging in too (harmless, and keeps
  // "open /dashboard afterward" working even for a desktop-initiated
  // login), but the flow the desktop client actually needs is the
  // one-time code below, not this cookie.
  await startSession(c, user.id);

  if (desktopRedirect) {
    const authCode = await issueDesktopAuthCode(c.env.DB, user.id);
    const target = new URL(desktopRedirect);
    target.searchParams.set("code", authCode);
    return c.redirect(target.toString());
  }

  return c.redirect("/dashboard");
});

/**
 * Desktop-only: exchanges the one-time code minted above for a real
 * Perseus session token, returned in the JSON body (never a cookie --
 * Desktop is not a browser, and never a URL/query param, so it can't
 * end up in server access logs). See services/desktopAuth.ts.
 */
authRoute.post("/desktop/token", async (c) => {
  const body = await c.req
    .json<{ code?: string }>()
    .catch((): { code?: string } => ({}));

  if (!body.code) {
    throw new BackendError("AuthError", "Missing authorization code.");
  }

  const { token } = await exchangeDesktopAuthCode(c.env.DB, body.code);
  return c.json({ token, tokenType: "Bearer" });
});

authRoute.post("/logout", async (c) => {
  await endSession(c);
  return c.redirect("/");
});
