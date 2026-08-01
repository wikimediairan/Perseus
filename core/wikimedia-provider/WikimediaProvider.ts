import { PerseusError } from "@core/platform/errors/PerseusError";
import type {
  WikimediaProviderType,
  WikimediaRequest,
  WikimediaResponse,
} from "@core/wikimedia-provider/contract";

const WIKIMEDIA_URL = "https://perseus-backend.alireza3205.workers.dev/";

export class WikimediaProvider implements WikimediaProviderType {
  readonly kind = "wikimedia" as const;

  async translate(request: WikimediaRequest): Promise<WikimediaResponse> {
    let response: Response;

    try {
      response = await fetch(WIKIMEDIA_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });
    } catch (error) {
      throw new PerseusError("ProviderError", "Could not reach Perseus Wikimedia backend.", {
        stage: "llm-translation",
        cause: error,
      });
    }

    const body = (await response.json().catch(() => null)) as WikimediaResponse | null;

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
