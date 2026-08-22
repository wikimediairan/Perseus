import { WIKIDATA_API, WIKIMEDIA_USER_AGENT } from "../../config/constants";
import type { TargetWikiDefinition } from "../../config/targetWikis";
import type { IntermediateRepresentation } from "../../ir/IntermediateRepresentation";
import { normalizeTitle } from "../../ir/wikitextLinkUtils";
import { PerseusError } from "../../platform/errors/PerseusError";
import type { Logger } from "../../platform/logging/Logger";
import { resolveRedirects } from "./RedirectResolver";

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

function toCategoryPageTitle(categoryName: string): string {
  return `Category:${categoryName}`;
}

function fromCategoryPageTitle(pageTitle: string): string {
  const colonIndex = pageTitle.indexOf(":");
  return colonIndex === -1 ? pageTitle : pageTitle.slice(colonIndex + 1);
}

export class WikidataLinkResolver implements LinkResolver {
  constructor(
    private readonly targetWiki: TargetWikiDefinition,
    private readonly logger?: Logger,
  ) {}

  async resolve(
    ir: IntermediateRepresentation,
  ): Promise<IntermediateRepresentation> {
    const templateLinkTargets = ir.structure.templateLinkTargets ?? [];

    if (
      ir.links.length === 0 &&
      ir.categories.length === 0 &&
      templateLinkTargets.length === 0
    ) {
      return ir;
    }

    const targetSiteKey = `${this.targetWiki.code}wiki`;

    const uniqueLinkTitles = [
      ...new Set(ir.links.map((link) => normalizeTitle(link.originalTarget))),
    ];
    const uniqueCategoryTitles = [
      ...new Set(
        ir.categories.map((category) =>
          normalizeTitle(toCategoryPageTitle(category.originalTarget)),
        ),
      ),
    ];
    const uniqueTemplateLinkTitles = [
      ...new Set(templateLinkTargets.map((target) => normalizeTitle(target))),
    ];
    const allOriginalTitles = [
      ...new Set([
        ...uniqueLinkTitles,
        ...uniqueCategoryTitles,
        ...uniqueTemplateLinkTitles,
      ]),
    ];

    const redirectMap = await resolveRedirects(allOriginalTitles, this.logger);
    const queryTitleFor = (originalNormalizedTitle: string): string =>
      redirectMap.get(originalNormalizedTitle) ?? originalNormalizedTitle;

    const allQueryTitles = [...new Set(allOriginalTitles.map(queryTitleFor))];
    const resolved = new Map<string, null | string>();

    for (const batch of chunk(allQueryTitles, BATCH_SIZE)) {
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
        response = await fetch(`${WIKIDATA_API}?${params.toString()}`, {
          headers: { "User-Agent": WIKIMEDIA_USER_AGENT },
        });
      } catch (error) {
        throw new PerseusError(
          "LinkResolutionError",
          "Could not reach Wikidata to resolve article links.",
          {
            stage: "resolve-wikidata-links",
            cause: error,
            context: { retryable: true },
          },
        );
      }

      if (!response.ok) {
        const upstreamMessage = await response
          .text()
          .then((text) => text.slice(0, 300))
          .catch(() => undefined);

        throw new PerseusError(
          "LinkResolutionError",
          `Wikidata returned an error while resolving links (HTTP ${response.status}).`,
          {
            stage: "resolve-wikidata-links",
            context: {
              status: response.status,
              retryable: response.status === 429 || response.status >= 500,
              ...(upstreamMessage ? { upstreamMessage } : {}),
            },
          },
        );
      }

      let body: WikidataEntitiesResponse;

      try {
        body = (await response.json()) as WikidataEntitiesResponse;
      } catch (error) {
        throw new PerseusError(
          "LinkResolutionError",
          "Wikidata returned a response that could not be parsed.",
          {
            stage: "resolve-wikidata-links",
            cause: error,
            context: { retryable: true },
          },
        );
      }

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

      for (const title of batch) {
        if (!resolved.has(title)) {
          resolved.set(title, null);
        }
      }
    }

    for (const link of ir.links) {
      link.resolvedTarget =
        resolved.get(queryTitleFor(normalizeTitle(link.originalTarget))) ??
        null;

      const anchor = ir.structure.linkElements.get(link.id);

      if (anchor && link.resolvedTarget) {
        anchor.setAttribute(
          "href",
          `./${encodeURIComponent(link.resolvedTarget.replaceAll(" ", "_"))}`,
        );
      }
    }

    let categoriesResolved = 0;

    for (const category of ir.categories) {
      const resolvedPageTitle =
        resolved.get(
          queryTitleFor(
            normalizeTitle(toCategoryPageTitle(category.originalTarget)),
          ),
        ) ?? null;
      category.resolvedTarget = resolvedPageTitle
        ? fromCategoryPageTitle(resolvedPageTitle)
        : null;

      const linkEl = ir.structure.categoryElements.get(category.id);

      if (linkEl && resolvedPageTitle) {
        linkEl.setAttribute(
          "href",
          `./${encodeURIComponent(resolvedPageTitle.replaceAll(" ", "_"))}`,
        );
        categoriesResolved++;
      }
    }

    let templateLinksResolved = 0;

    for (const title of uniqueTemplateLinkTitles) {
      const resolvedTarget = resolved.get(queryTitleFor(title)) ?? null;

      ir.structure.templateLinkResolutions.set(title, {
        resolvedTarget,
        fallbackTemplateName: resolvedTarget
          ? null
          : this.targetWiki.interwikiFallbackTemplate,
      });

      if (resolvedTarget) {
        templateLinksResolved++;
      }
    }

    this.logger?.info(
      `Resolved ${uniqueLinkTitles.filter((t) => resolved.get(queryTitleFor(t))).length}/${uniqueLinkTitles.length} links to ${this.targetWiki.displayName} equivalents`,
    );

    if (ir.categories.length > 0) {
      this.logger?.info(
        `Resolved ${categoriesResolved}/${ir.categories.length} categories to ${this.targetWiki.displayName} equivalents`,
      );
    }

    if (uniqueTemplateLinkTitles.length > 0) {
      this.logger?.info(
        `Resolved ${templateLinksResolved}/${uniqueTemplateLinkTitles.length} template-parameter links to ${this.targetWiki.displayName} equivalents`,
      );
    }

    return ir;
  }
}
