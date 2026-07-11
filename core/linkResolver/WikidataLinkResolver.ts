/**
 * WikidataLinkResolver
 *
 * Real implementation. For every LinkNode, resolves a target-wiki-title
 * equivalent via Wikidata's own API and writes it into `resolvedTarget`
 * (Software Specification, Link Resolution). Mutates the IR in place —
 * both the flat `links` array and, correspondingly, the underlying DOM
 * `<a href>` so that Wikitext Generation later serializes a link that
 * actually points to the target-wiki article.
 *
 * Uses `wbgetentities` with `sites=enwiki` to look up the Wikidata item
 * for the English title, then reads its `{targetWiki.code}wiki` sitelink.
 * This is a direct Wikidata query (not MediaWiki's `langlinks`), keeping
 * this stage literally "Wikidata" per the fixed architecture.
 *
 * The target wiki is injected at construction (from PerseusConfig, via
 * createPipeline) rather than read from a fixed constant — this is what
 * makes additional target wikis (config/targetWikis.ts) a registry
 * addition instead of a code change here.
 *
 * Batches up to 50 titles per request (the API's practical limit for
 * anonymous requests) to avoid one HTTP round trip per link.
 */

import { WIKIDATA_API } from "@core/config/constants";
import type { TargetWikiDefinition } from "@core/config/targetWikis";
import { PerseusError } from "@core/errors/PerseusError";
import type { IntermediateRepresentation } from "@core/ir/IntermediateRepresentation";
import type { Logger } from "@core/logging/Logger";

export interface LinkResolver {
  resolve(ir: IntermediateRepresentation): Promise<IntermediateRepresentation>;
}

const BATCH_SIZE = 50;

interface WikidataEntitiesResponse {
  entities?: Record<
    string,
    {
      missing?: string;
      sitelinks?: Record<string, { title: string }>;
    }
  >;
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];

  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }

  return result;
}

function normalizeTitle(title: string): string {
  return title.replaceAll("_", " ").trim();
}

export class WikidataLinkResolver implements LinkResolver {
  constructor(
    private readonly targetWiki: TargetWikiDefinition,
    private readonly logger?: Logger,
  ) {}

  async resolve(ir: IntermediateRepresentation): Promise<IntermediateRepresentation> {
    if (ir.links.length === 0) {
      return ir;
    }

    const targetSiteKey = `${this.targetWiki.code}wiki`;

    // Only resolve each distinct title once, even if it's linked multiple times.
    // Titles are normalized (underscores -> spaces) so hrefs like "./Ada_Lovelace"
    // match consistently against Wikidata's returned (space-formatted) titles.
    const uniqueTitles = [...new Set(ir.links.map((link) => normalizeTitle(link.originalTarget)))];
    const resolved = new Map<string, null | string>();

    for (const batch of chunk(uniqueTitles, BATCH_SIZE)) {
      const params = new URLSearchParams({
        action: "wbgetentities",
        sites: "enwiki",
        titles: batch.join("|"),
        props: "sitelinks",
        sitefilter: `enwiki|${targetSiteKey}`,
        format: "json",
        origin: "*",
      });

      let response: Response;

      try {
        response = await fetch(`${WIKIDATA_API}?${params.toString()}`);
      } catch (error) {
        // Per Spec 12.2: a Wikidata connectivity failure is distinct from a genuine
        // "no target-wiki equivalent" result — surface it as an error rather than
        // silently resolving every link in this batch to null.
        throw new PerseusError(
          "LinkResolutionError",
          "Could not reach Wikidata to resolve article links.",
          {
            stage: "resolve-wikidata-links",
            cause: error,
          },
        );
      }

      if (!response.ok) {
        throw new PerseusError(
          "LinkResolutionError",
          `Wikidata returned an error while resolving links (HTTP ${response.status}).`,
          {
            stage: "resolve-wikidata-links",
            context: { status: response.status },
          },
        );
      }

      const body = (await response.json()) as WikidataEntitiesResponse;

      for (const entity of Object.values(body.entities ?? {})) {
        if (entity.missing !== undefined) {
          continue;
        }

        const enTitle = entity.sitelinks?.enwiki?.title;
        const targetTitle = entity.sitelinks?.[targetSiteKey]?.title;

        if (enTitle) {
          resolved.set(normalizeTitle(enTitle), targetTitle ?? null);
        }
      }

      // Any title in this batch we didn't find a Wikidata entity for resolves to null.
      for (const title of batch) {
        if (!resolved.has(title)) {
          resolved.set(title, null);
        }
      }
    }

    for (const link of ir.links) {
      link.resolvedTarget = resolved.get(normalizeTitle(link.originalTarget)) ?? null;

      const anchor = ir.structure.linkElements.get(link.id);

      if (anchor && link.resolvedTarget) {
        anchor.setAttribute(
          "href",
          `./${encodeURIComponent(link.resolvedTarget.replaceAll(" ", "_"))}`,
        );
      }
    }

    this.logger?.info(
      `Resolved ${[...resolved.values()].filter(Boolean).length}/${uniqueTitles.length} links to ${this.targetWiki.displayName} equivalents`,
    );

    return ir;
  }
}
