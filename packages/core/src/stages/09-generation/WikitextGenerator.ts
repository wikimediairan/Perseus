import { WIKIMEDIA_USER_AGENT, WIKIPEDIA_DOMAIN } from "../../config/constants";
import type { TargetWikiDefinition } from "../../config/targetWikis";
import type { IntermediateRepresentation } from "../../ir/IntermediateRepresentation";
import { PerseusError } from "../../platform/errors/PerseusError";
import { applyInterwikiFallbackLinks } from "./interwikiFallback";
import { removeDenylistedTemplates } from "./templateRemoval";

export interface WikitextGenerator {
  generate(
    ir: IntermediateRepresentation,
    targetWiki?: TargetWikiDefinition,
  ): Promise<string>;
}

export class WikipediaWikitextGenerator implements WikitextGenerator {
  async generate(
    ir: IntermediateRepresentation,
    targetWiki?: TargetWikiDefinition,
  ): Promise<string> {
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

    if (targetWiki) {
      removeDenylistedTemplates(root, targetWiki.templateRemovalDenylist);

      applyInterwikiFallbackLinks(root, ir, targetWiki);
    }

    const html = root.innerHTML;
    const title = encodeURIComponent(ir.sourceTitle || "Untitled");
    const endpoint = `https://${WIKIPEDIA_DOMAIN}/api/rest_v1/transform/html/to/wikitext/${title}`;

    let response: Response;

    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",

          "User-Agent": WIKIMEDIA_USER_AGENT,
        },
        body: JSON.stringify({ html: `<html><body>${html}</body></html>` }),
      });
    } catch (error) {
      throw new PerseusError(
        "GenerationError",
        "Could not reach the Wikitext generation service.",
        {
          stage: "generate-wikitext",
          cause: error,
          context: { retryable: true },
        },
      );
    }

    if (!response.ok) {
      throw new PerseusError(
        "GenerationError",
        `Wikitext generation failed (HTTP ${response.status}). The translated content may contain markup the service could not serialize.`,
        {
          stage: "generate-wikitext",
          context: {
            status: response.status,
            retryable: response.status === 429 || response.status >= 500,
          },
        },
      );
    }

    const wikitext = (await response.text()).trim();

    if (targetWiki?.translationDisclosureTemplate) {
      return `${targetWiki.translationDisclosureTemplate}\n${wikitext}`;
    }

    return wikitext;
  }
}
