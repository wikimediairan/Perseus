import { WIKIPEDIA_DOMAIN } from "@core/config/constants";
import type { IntermediateRepresentation } from "@core/ir/IntermediateRepresentation";
import { PerseusError } from "@core/platform/errors/PerseusError";

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
