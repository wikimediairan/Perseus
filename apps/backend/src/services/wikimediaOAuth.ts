import type { Env } from "@/config/env";
import { WIKIMEDIA_HEADERS } from "@/constants/wikimedia";
import { BackendError } from "@/shared/errors";

const AUTHORIZE_URL = "https://meta.wikimedia.org/w/rest.php/oauth2/authorize";
const TOKEN_URL = "https://meta.wikimedia.org/w/rest.php/oauth2/access_token";
const PROFILE_URL =
  "https://meta.wikimedia.org/w/rest.php/oauth2/resource/profile";

export interface WikimediaProfile {
  wikimediaUserId: string;
  wikimediaUsername: string;
}

export function buildWikimediaAuthorizeUrl(
  env: Env,
  state: string,
  redirectUri: string,
): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env.WIKIMEDIA_CONSUMER_KEY);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeWikimediaCode(
  env: Env,
  code: string,
  redirectUri: string,
): Promise<string> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...WIKIMEDIA_HEADERS,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: env.WIKIMEDIA_CONSUMER_KEY,
      client_secret: env.WIKIMEDIA_CONSUMER_SECRET,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();

    throw new BackendError(
      "AuthError",
      "Failed to exchange Wikimedia OAuth code.",
      {
        status: response.status,
        providerResponse: errorBody,
      },
    );
  }

  const body = await response.json<{ access_token?: string }>();

  if (!body.access_token) {
    throw new BackendError(
      "AuthError",
      "Wikimedia OAuth token response missing access_token.",
    );
  }

  return body.access_token;
}

export async function fetchWikimediaProfile(
  accessToken: string,
): Promise<WikimediaProfile> {
  const response = await fetch(PROFILE_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new BackendError("AuthError", "Failed to fetch Wikimedia profile.", {
      status: response.status,
    });
  }

  const body = await response.json<{
    sub?: number | string;
    username?: string;
  }>();

  if (!body.sub || !body.username) {
    throw new BackendError(
      "AuthError",
      "Wikimedia profile response missing sub/username.",
    );
  }

  return {
    wikimediaUserId: String(body.sub),
    wikimediaUsername: body.username,
  };
}
