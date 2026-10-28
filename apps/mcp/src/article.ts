import "./runtime.js";
import {
  buildIRFromParsoidHtml,
  type Chunk,
  DEFAULT_MAX_CHUNK_CHARS,
  DomMerger,
  type ExtractionResult,
  exportTranslationSession,
  fetchRevisionHtml,
  getTargetWiki,
  HeuristicReferenceAttentionClassifier,
  type IntermediateRepresentation,
  Pipeline,
  type PipelineDependencies,
  parseChunkTranslation,
  renderChunkForTranslation,
  SizeBoundedChunker,
  type TargetWikiCode,
  WikidataLinkResolver,
  WikipediaExtractor,
  WikipediaInputLoader,
  WikipediaWikitextGenerator,
} from "@perseus/core";
import { type StderrLogger, ToolError } from "./runtime.js";
import type { ArticleSnapshot, SavedSession } from "./schema.js";

export function makePipeline(
  targetWiki: TargetWikiCode,
  logger: StderrLogger,
  parser: PipelineDependencies["parser"],
): Pipeline {
  return new Pipeline({
    logger,
    targetWiki,
    parser,
    inputLoader: new WikipediaInputLoader(),
    linkResolver: new WikidataLinkResolver(getTargetWiki(targetWiki), logger),
    extractor: new WikipediaExtractor(),
    chunker: new SizeBoundedChunker(),
    // This server deliberately has no model provider or model credentials.
    translator: {
      async translate() {
        throw new Error("Translation must be performed by the connected agent");
      },
      async translateChunk() {
        throw new Error("Translation must be performed by the connected agent");
      },
    },
    merger: new DomMerger(logger),
    generator: new WikipediaWikitextGenerator(),
    referenceAttention: new HeuristicReferenceAttentionClassifier(),
  });
}

export async function prepareArticle(
  url: string,
  target: TargetWikiCode,
  logger: StderrLogger,
) {
  let html = "";
  let rawWikitext = "";
  const pipeline = makePipeline(target, logger, {
    async parse(article) {
      rawWikitext = article.rawWikitext;
      // Match Desktop's revision reconstruction, rather than parsing a moving latest page.
      html = await fetchRevisionHtml(
        article.revision.revisionId,
        "en.wikipedia.org",
      );
      return buildIRFromParsoidHtml(html, article.sourceTitle, logger);
    },
  });
  const extraction = await pipeline.runToExtraction({ url });
  const chunks = await pipeline.deriveChunks(extraction.worklist);
  const { ir } = extraction;
  const resolutions = (
    nodes:
      | IntermediateRepresentation["links"]
      | IntermediateRepresentation["categories"],
    elements: Map<string, Element>,
  ) =>
    nodes.map(({ id, resolvedTarget }) => ({
      id,
      resolvedTarget,
      href: resolvedTarget
        ? (elements.get(id)?.getAttribute("href") ?? null)
        : null,
    }));
  const snapshot: ArticleSnapshot = {
    html,
    rawWikitext,
    links: resolutions(ir.links, ir.structure.linkElements),
    categories: resolutions(ir.categories, ir.structure.categoryElements),
    templateLinks: [...ir.structure.templateLinkResolutions],
  };
  return { extraction, chunks, snapshot };
}

export async function restoreArticle(
  session: SavedSession,
  logger: StderrLogger,
) {
  const ir = buildIRFromParsoidHtml(
    session.snapshot.html,
    session.source.title,
    logger,
  );
  const restore = (
    nodes:
      | IntermediateRepresentation["links"]
      | IntermediateRepresentation["categories"],
    elements: Map<string, Element>,
    saved: ArticleSnapshot["links"],
  ) => {
    if (
      saved.length !== nodes.length ||
      saved.some((item, i) => item.id !== nodes[i].id)
    )
      throw new ToolError(
        "INVALID_SESSION",
        "Saved link metadata does not match the article snapshot.",
      );
    saved.forEach((item, i) => {
      nodes[i].resolvedTarget = item.resolvedTarget;
      if (item.href !== null)
        elements.get(item.id)?.setAttribute("href", item.href);
    });
  };
  restore(ir.links, ir.structure.linkElements, session.snapshot.links);
  restore(
    ir.categories,
    ir.structure.categoryElements,
    session.snapshot.categories,
  );
  for (const [title, resolution] of session.snapshot.templateLinks)
    ir.structure.templateLinkResolutions.set(title, resolution);
  const pipeline = makePipeline(session.targetLanguage, logger, {
    async parse() {
      return ir;
    },
  });
  const worklist = await new WikipediaExtractor().extract(ir);
  const chunks = await pipeline.deriveChunks(worklist);
  const savedSources = session.chunks.map(({ id, units }) => ({ id, units }));
  if (JSON.stringify(chunks) !== JSON.stringify(savedSources))
    throw new ToolError(
      "INVALID_SESSION",
      "Saved chunks differ from the article snapshot. Use the matching Perseus version or restore a backup.",
    );
  for (const chunk of session.chunks) {
    if (chunk.accepted !== null) validateResponse(chunk, chunk.accepted);
    if (
      (chunk.accepted === null) !== (chunk.version === 0) ||
      (chunk.accepted === null) !== (chunk.lastSubmission === null) ||
      (chunk.lastSubmission &&
        chunk.lastSubmission.version !== chunk.version - 1)
    )
      throw new ToolError(
        "INVALID_SESSION",
        "Saved chunk versions are inconsistent.",
      );
  }
  const extraction: ExtractionResult = {
    ir,
    worklist,
    source: session.source,
    targetWiki: session.targetLanguage,
  };
  return { pipeline, extraction };
}

function markers(text: string): string[] {
  return text.match(/⟪(?:\*|\/)?\d+⟫/g) ?? [];
}

export function validateResponse(chunk: Chunk, content: string) {
  const parsed = parseChunkTranslation(chunk, content);
  if (content.split("\n", 1)[0] !== renderIdentity(chunk))
    throw new ToolError(
      "INVALID_TRANSLATION",
      "Reproduce the first identity line exactly as returned by get_translation_chunk.",
    );
  // Core tolerates partial responses for interactive editing. MCP accepts a
  // whole chunk only, and enforces the exact segment/placeholder sequence.
  const segmentIds = [...content.matchAll(/\[\[SEGMENT (\d+)\]\]/g)].map(
    (match) => match[0],
  );
  if (
    segmentIds.length !== chunk.units.length ||
    segmentIds.some((id, i) => id !== `[[SEGMENT ${i + 1}]]`)
  )
    throw new ToolError(
      "INVALID_TRANSLATION",
      "Include every [[SEGMENT n]] exactly once, in source order; do not add segments.",
    );
  if (parsed.missingUnitIds.length)
    throw new ToolError(
      "INVALID_TRANSLATION",
      `Missing, empty, or damaged segments: ${parsed.missingUnitIds.slice(0, 10).join(", ")}. Restore all protected tokens from get_translation_chunk.`,
    );
  for (const unit of parsed.units) {
    if (
      JSON.stringify(markers(unit.sourceText)) !==
      JSON.stringify(markers(unit.translatedText))
    )
      throw new ToolError(
        "INVALID_TRANSLATION",
        `Preserve the exact order of protected tokens in ${unit.nodeId}.`,
      );
  }
  const firstSegment = content.indexOf("[[SEGMENT 1]]");
  if (content.slice(content.indexOf("\n") + 1, firstSegment).trim())
    throw new ToolError(
      "INVALID_TRANSLATION",
      "Do not include commentary between the identity line and the first segment.",
    );
  return parsed.units;
}

function renderIdentity(chunk: Chunk): string {
  return renderChunkForTranslation(chunk).split("\n", 1)[0];
}

export async function renderExport(
  session: SavedSession,
  logger: StderrLogger,
) {
  const { pipeline, extraction } = await restoreArticle(session, logger);
  let ir = extraction.ir;
  for (const chunk of session.chunks) {
    if (chunk.accepted !== null)
      ir = await pipeline.mergeChunk(ir, {
        id: chunk.id,
        units: validateResponse(chunk, chunk.accepted),
      });
  }
  await pipeline.classifyReferenceAttention(ir);
  const desktopSession = exportTranslationSession(
    { ...extraction, ir },
    session.chunks,
    DEFAULT_MAX_CHUNK_CHARS,
  );
  const wikitext = await pipeline.generateWikitext(ir);
  return { desktopSession, wikitext };
}
