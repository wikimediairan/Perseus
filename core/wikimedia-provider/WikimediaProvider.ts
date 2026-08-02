import { PerseusError } from "@core/platform/errors/PerseusError";
import type {
  WikimediaProviderType,
  WikimediaRequest,
  WikimediaResponse,
} from "@core/wikimedia-provider/contract";

export const WIKIMEDIA_BASE_URL = "https://perseus-backend.alireza3205.workers.dev";

export class WikimediaProvider implements WikimediaProviderType {
  readonly kind = "wikimedia" as const;

  constructor(private readonly apiKey?: string) {}

  async translate(request: WikimediaRequest): Promise<WikimediaResponse> {
    if (!this.apiKey) {
      throw new PerseusError("ConfigurationError", "No API key configured for Wikimedia.", {
        stage: "llm-translation",
      });
    }

    let response: Response;

    try {
      response = await fetch(new URL("/v1/translate", WIKIMEDIA_BASE_URL), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(request),
      });
    } catch (error) {
      throw new PerseusError("ProviderError", "Could not reach Perseus Wikimedia backend.", {
        stage: "llm-translation",
        cause: error,
      });
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
          stage: "llm-translation",
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
