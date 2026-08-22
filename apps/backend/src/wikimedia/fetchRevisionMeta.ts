/**
 * fetchRevisionMeta.ts
 *
 * A small, backend-specific gap-filler: Core's `ArticleRevisionSource`
 * (see `@perseus/core`) requires a `title` (used for display and for
 * Parsoid's template-expansion context), but the backend's translate
 * API only ever accepted `{ wiki, pageId, revisionId }` — no title —
 * so a byte doesn't exist for one on the wire.
 *
 * This is deliberately NOT a duplicate of Core's revision fetching:
 * Core's `Pipeline.reconstructFromRevision` fetches the full Parsoid
 * HTML for a revision (`/revision/{id}/html`); this fetches only the
 * lightweight `/revision/{id}/bare` metadata (title + page id), purely
 * to fill the one field the request shape doesn't carry, and to assert
 * the caller's claimed `pageId` actually matches the revision before
 * Core ever does the expensive parse.
 *
 * IMPORTANT: this call and Core's `fetchRevisionHtml` hit the same
 * Wikimedia REST surface, back-to-back, for the same revision, inside
 * one `/v1/translate` request. They MUST present the exact same
 * `User-Agent` (Core's single canonical `WIKIMEDIA_USER_AGENT`) rather
 * than a locally-defined one — two different identities on consecutive
 * requests for the same page was the root cause of a production 403
 * that a single isolated request never reproduced. Do not reintroduce
 * a second Wikimedia User-Agent constant here.
 */
import {
  PerseusError,
  WIKIMEDIA_USER_AGENT,
  WIKIPEDIA_DOMAIN,
} from "@perseus/core";

interface BareRevisionResponse {
  id?: number;
  page?: { id?: number; title?: string };
}

export async function fetchRevisionTitle(
  revisionId: number,
  expectedPageId: number,
): Promise<string> {
  const endpoint = `https://${WIKIPEDIA_DOMAIN}/w/rest.php/v1/revision/${revisionId}/bare`;

  let response: Response;

  try {
    response = await fetch(endpoint, {
      headers: {
        "User-Agent": WIKIMEDIA_USER_AGENT,
        Accept: "application/json",
      },
    });
  } catch (error) {
    throw new PerseusError(
      "ParsingError",
      "Could not reach Wikipedia to look up the saved revision.",
      { stage: "load-article", cause: error, context: { retryable: true } },
    );
  }

  if (response.status === 404) {
    throw new PerseusError(
      "InputError",
      `Wikipedia revision ${revisionId} could not be found. It may have been deleted or oversighted.`,
      { stage: "load-article", context: { notFound: true } },
    );
  }

  if (!response.ok) {
    throw new PerseusError(
      "ParsingError",
      `Failed to look up revision ${revisionId} (HTTP ${response.status}).`,
      {
        stage: "load-article",
        context: {
          status: response.status,
          retryable: response.status === 429 || response.status >= 500,
        },
      },
    );
  }

  const body = (await response.json()) as BareRevisionResponse;

  if (typeof body.page?.title !== "string") {
    throw new PerseusError(
      "ParsingError",
      `Wikipedia's response for revision ${revisionId} did not include a page title.`,
      { stage: "load-article" },
    );
  }

  if (body.page.id !== expectedPageId) {
    throw new PerseusError(
      "InputError",
      `Revision ${revisionId} belongs to page ${body.page.id}, not the requested page ${expectedPageId}.`,
      { stage: "load-article" },
    );
  }

  return body.page.title;
}
