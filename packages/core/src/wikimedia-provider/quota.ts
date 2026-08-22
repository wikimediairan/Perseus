import { PerseusError } from "../platform/errors/PerseusError";
import { WIKIMEDIA_BASE_URL } from "./WikimediaProvider";

export interface WikimediaQuota {
  weeklyLimitCost: number;
  usedCost: number;
  remainingCost: number;
  resetsAt: string;
}

export async function fetchWikimediaQuota(
  sessionToken: string,
): Promise<WikimediaQuota> {
  let response: Response;

  try {
    response = await fetch(new URL("/v1/quota", WIKIMEDIA_BASE_URL), {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
  } catch (error) {
    throw new PerseusError(
      "ProviderError",
      "Could not reach the Wikimedia backend for quota.",
      {
        cause: error,
      },
    );
  }

  if (!response.ok) {
    throw new PerseusError(
      "ProviderError",
      `Could not load Wikimedia quota (HTTP ${response.status}).`,
      { context: { status: response.status } },
    );
  }

  return (await response.json()) as WikimediaQuota;
}
