/**
 * WikitextGenerator
 *
 * Real implementation. Serializes the final, merged IR (its underlying
 * DOM, now containing Persian text and Persian-resolved link hrefs) back
 * into Wikitext, using the same MediaWiki REST API that ParsoidParser
 * used in reverse:
 *
 *   POST https://{domain}/api/rest_v1/transform/html/to/wikitext/{title}
 *
 * This is the same principle as parsing: rather than reimplementing
 * Parsoid's HTML->Wikitext serializer, we call the real service that
 * hosts it. Per Spec NFR-2, generation from a given IR is deterministic
 * — this stage performs no translation or structural decisions of its
 * own, only serialization.
 */

import { WIKIPEDIA_DOMAIN } from "@core/config/constants";
import { PerseusError } from "@core/errors/PerseusError";
import type { IntermediateRepresentation } from "@core/ir/IntermediateRepresentation";


export interface WikitextGenerator {
  generate(ir: IntermediateRepresentation): Promise<string>;
}

export class WikipediaWikitextGenerator implements WikitextGenerator {
  async generate(ir: IntermediateRepresentation): Promise<string> {
    const root = ir.structure.document.getElementById("perseus-root");

    if (!root) {
      throw new PerseusError(
        "GenerationError",
        "The parsed document is missing its root element.",
        {
          stage: "generate-wikitext",
        },
      );
    }

    const html = root.innerHTML;
    const title = encodeURIComponent(ir.sourceTitle || "Untitled");
    const endpoint = `https://${WIKIPEDIA_DOMAIN}/api/rest_v1/transform/html/to/wikitext/${title}`;

    let response: Response;

    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html: `<html><body>${html}</body></html>` }),
      });
    } catch (error) {
      throw new PerseusError(
        "GenerationError",
        "Could not reach the Wikitext generation service.",
        {
          stage: "generate-wikitext",
          cause: error,
        },
      );
    }

    if (!response.ok) {
      throw new PerseusError(
        "GenerationError",
        `Wikitext generation failed (HTTP ${response.status}). The translated content may contain markup the service could not serialize.`,
        { stage: "generate-wikitext", context: { status: response.status } },
      );
    }

    return (await response.text()).trim();
  }
}
