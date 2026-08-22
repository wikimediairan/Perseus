import { PerseusError } from "../platform/errors/PerseusError";
import type { TextProviderType } from "../stages/06-translation/LLMProvider";
import type {
  WikimediaProviderType,
  WikimediaRequest,
  WikimediaResponse,
} from "./contract";

export const WIKIMEDIA_BASE_URL =
  "https://perseus-backend.alireza3205.workers.dev";

export class WikimediaProvider implements WikimediaProviderType {
  readonly kind = "wikimedia" as const;

  constructor(private readonly sessionToken?: string) {}

  async translate(request: WikimediaRequest): Promise<WikimediaResponse> {
    if (!this.sessionToken) {
      throw new PerseusError(
        "ConfigurationError",
        "Not signed in to Perseus. Sign in with Wikimedia before translating.",
        {
          stage: "translation",
        },
      );
    }

    let response: Response;

    try {
      response = await fetch(new URL("/v1/translate", WIKIMEDIA_BASE_URL), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.sessionToken}`,
        },
        body: JSON.stringify(request),
      });
    } catch (error) {
      throw new PerseusError(
        "ProviderError",
        "Could not reach Perseus Wikimedia backend.",
        {
          stage: "translation",
          cause: error,
        },
      );
    }

    const rawBody = await response.text();

    console.log("Wikimedia backend response", {
      status: response.status,
      body: rawBody,
    });

    const body = JSON.parse(rawBody) as WikimediaResponse;

    if (!response.ok || !body) {
      throw new PerseusError(
        "ProviderError",
        `Perseus Wikimedia backend failed (HTTP ${response.status}).`,
        {
          stage: "translation",
          context: {
            status: response.status,
            body,
          },
        },
      );
    }

    return body;
  }
}

export function isWikimediaProvider(
  provider: TextProviderType | WikimediaProviderType,
): provider is WikimediaProviderType {
  return provider.kind === "wikimedia";
}
