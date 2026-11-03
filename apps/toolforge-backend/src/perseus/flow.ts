import {
  buildIRFromParsoidRoot,
  type Chunk,
  createProvider,
  DefaultPromptManager,
  DomMerger,
  getTargetWiki,
  type IntermediateRepresentation,
  LLMTranslator,
  type Logger,
  SizeBoundedChunker,
  type TargetWikiDefinition,
  type TranslatedChunk,
  WIKIMEDIA_MODELS,
  WikidataLinkResolver,
  WikipediaExtractor,
  WikipediaWikitextGenerator,
} from "@perseus/core";
import type { AppConfig } from "../config.js";
import type {
  SectionSelection,
  TargetWikiCode,
  TranslatedChunkRecord,
} from "../domain/types.js";
import { ApiError } from "../util/errors.js";
import { selectSections } from "./sections.js";
import { validateGeneratedStructure } from "./validate.js";

export interface PreparedArticle {
  ir: IntermediateRepresentation;
  chunks: Chunk[];
  warnings: string[];
  needsReferencesList: boolean;
}

/**
 * Perseus Core historically calls the Tajik target "tj" even though the
 * Wikipedia site code and domain are "tg". Keep the public Toolforge contract
 * on "tg" and adapt to Core's internal definition without changing the
 * desktop pipeline.
 */
function targetDefinition(targetWiki: TargetWikiCode): TargetWikiDefinition {
  const base = getTargetWiki(targetWiki === "tg" ? "tj" : "fa");
  if (targetWiki === "fa") return base;
  return {
    ...base,
    code: "tg" as unknown as TargetWikiDefinition["code"],
    displayName: "Tajik Wikipedia",
    domain: "tg.wikipedia.org",
  };
}

export async function prepareSelectedArticle(
  config: AppConfig,
  sourceHtml: string,
  sourceTitle: string,
  sourceDomain: string,
  targetWiki: TargetWikiCode,
  selection: SectionSelection,
  logger: Logger,
): Promise<PreparedArticle> {
  const selected = selectSections(sourceHtml, selection);
  const ir = buildIRFromParsoidRoot(
    selected.root,
    sourceTitle,
    logger,
    sourceDomain,
  );

  const resolver = new WikidataLinkResolver(
    targetDefinition(targetWiki),
    logger,
  );
  await resolver.resolve(ir);

  const worklist = await new WikipediaExtractor().extract(ir);
  const chunks = await new SizeBoundedChunker().chunk(worklist);

  if (chunks.length === 0) {
    throw new ApiError(
      422,
      "NO_TRANSLATABLE_CONTENT",
      "The selected sections contain no translatable prose.",
    );
  }

  if (chunks.length > config.maxChunks) {
    throw new ApiError(
      413,
      "TOO_MANY_CHUNKS",
      `This selection needs ${chunks.length} chunks; the current limit is ${config.maxChunks}. Select fewer sections.`,
      { chunks: chunks.length, limit: config.maxChunks },
    );
  }

  return {
    ir,
    chunks,
    warnings: selected.warnings,
    needsReferencesList: selected.needsReferencesList,
  };
}

export function createTranslator(
  config: AppConfig,
  targetWiki: TargetWikiCode,
  logger: Logger,
): LLMTranslator {
  if (!(WIKIMEDIA_MODELS as readonly string[]).includes(config.model)) {
    throw new ApiError(
      500,
      "MODEL_NOT_ALLOWED",
      `The configured model "${config.model}" is not in the Perseus allow-list.`,
    );
  }

  const provider = createProvider({
    kind: "openrouter",
    model: config.model,
    apiKey: config.openRouterApiKey,
  });

  if (provider.kind === "wikimedia") {
    throw new ApiError(
      500,
      "PROVIDER_CONFIGURATION_ERROR",
      "The Toolforge backend requires a text provider, not the Wikimedia proxy provider.",
    );
  }

  // createProvider's return type is a union even when the config is narrowed;
  // this branch is the text-provider path.
  const textProvider = provider as Extract<
    typeof provider,
    { kind: "openrouter" | "9router" }
  >;

  return new LLMTranslator(
    textProvider,
    new DefaultPromptManager(),
    targetDefinition(targetWiki),
    logger,
  );
}

export async function translate(
  translator: LLMTranslator,
  chunk: Chunk,
  options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<TranslatedChunk> {
  return translator.translateChunk(chunk, options);
}

export async function assemble(
  ir: IntermediateRepresentation,
  chunks: Chunk[],
  translations: TranslatedChunkRecord[],
  targetWiki: TargetWikiCode,
  logger: Logger,
  needsReferencesList: boolean,
): Promise<string> {
  const byId = new Map(translations.map((item) => [item.id, item]));
  const ordered: TranslatedChunk[] = [];

  for (const chunk of chunks) {
    const translated = byId.get(chunk.id);
    if (!translated) {
      throw new ApiError(
        409,
        "TRANSLATION_INCOMPLETE",
        `Chunk ${chunk.id} has no successful translation.`,
      );
    }
    ordered.push({
      id: translated.id,
      units: translated.units,
      usage: translated.usage,
    });
  }

  const merger = new DomMerger(logger);
  let current = ir;
  for (const chunk of ordered) {
    current = await merger.merge(current, [chunk]);
  }

  // linkedom (the Toolforge DOM) serializes raw ampersands in attributes,
  // unlike a browser DOM. Escape them before Core's HTML-to-wikitext step so
  // URLs and data-mw values survive a second HTML parse.
  normalizeAttributeEntities(current);

  const generator = new WikipediaWikitextGenerator();
  let wikitext = await generator.generate(
    current,
    targetDefinition(targetWiki),
  );
  const generatedRoot =
    current.structure.document.getElementById("perseus-root");
  if (!generatedRoot) {
    throw new ApiError(
      422,
      "OUTPUT_STRUCTURE_LOSS",
      "The generated article lost its document root.",
    );
  }
  validateGeneratedStructure(generatedRoot, wikitext, targetWiki);

  if (needsReferencesList && !hasReferencesSection(wikitext)) {
    wikitext +=
      targetWiki === "fa"
        ? "\n\n== منابع ==\n{{پانویس}}"
        : "\n\n== Сарчашмаҳо ==\n<references />";
  }

  return wikitext;
}

function normalizeAttributeEntities(ir: IntermediateRepresentation): void {
  for (const element of ir.structure.document.querySelectorAll("*")) {
    for (const attribute of Array.from(element.attributes)) {
      if (!attribute.value.includes("&")) continue;
      element.setAttribute(
        attribute.name,
        attribute.value.replaceAll("&", "&amp;"),
      );
    }
  }
}

function hasReferencesSection(wikitext: string): boolean {
  return /^==\s*(منابع|پانویس|references|notes|сарчашмаҳо|эзоҳҳо)\s*==\s*$/im.test(
    wikitext,
  );
}
