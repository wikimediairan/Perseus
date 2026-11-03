import type { AppConfig } from "../config.js";
import { ApiError } from "../util/errors.js";

const AUTHORIZE_URL = "https://meta.wikimedia.org/w/rest.php/oauth2/authorize";
const TOKEN_URL = "https://meta.wikimedia.org/w/rest.php/oauth2/access_token";
const PROFILE_URL =
  "https://meta.wikimedia.org/w/rest.php/oauth2/resource/profile";

export interface WikimediaProfile {
  wikimediaUserId: string;
  username: string;
}

export function assertOAuthConfigured(config: AppConfig): void {
  if (!config.oauth.clientId || !config.oauth.clientSecret) {
    throw new ApiError(
      503,
      "OAUTH_NOT_CONFIGURED",
      "Wikimedia OAuth is not configured on this server.",
    );
  }
}

export function buildAuthorizeUrl(config: AppConfig, state: string): string {
  assertOAuthConfigured(config);
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.oauth.clientId);
  url.searchParams.set("redirect_uri", config.oauth.redirectUri);
  url.searchParams.set("state", state);
  if (config.oauth.scope) {
    url.searchParams.set("scope", config.oauth.scope);
  }
  return url.toString();
}

export async function exchangeCode(
  config: AppConfig,
  code: string,
): Promise<string> {
  assertOAuthConfigured(config);

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": config.userAgent,
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.oauth.redirectUri,
      client_id: config.oauth.clientId,
      client_secret: config.oauth.clientSecret,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ApiError(
      502,
      "OAUTH_TOKEN_EXCHANGE_FAILED",
      "Wikimedia OAuth token exchange failed.",
      { status: response.status, upstream: body.slice(0, 300) },
    );
  }

  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) {
    throw new ApiError(
      502,
      "OAUTH_TOKEN_MISSING",
      "Wikimedia OAuth response did not include an access token.",
    );
  }
  return body.access_token;
}

export async function fetchProfile(
  config: AppConfig,
  accessToken: string,
): Promise<WikimediaProfile> {
  const response = await fetch(PROFILE_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": config.userAgent,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new ApiError(
      502,
      "OAUTH_PROFILE_FAILED",
      "Could not load the Wikimedia profile.",
      { status: response.status },
    );
  }

  const body = (await response.json()) as {
    sub?: number | string;
    username?: string;
  };

  if (!body.sub || !body.username) {
    throw new ApiError(
      502,
      "OAUTH_PROFILE_INVALID",
      "Wikimedia profile response was missing sub/username.",
    );
  }

  return {
    wikimediaUserId: String(body.sub),
    username: body.username,
  };
}
