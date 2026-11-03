import type {
  JobRecord,
  JobView,
  SectionNode,
  SectionSelection,
} from "../domain/types.js";

export function toJobView(job: JobRecord): JobView {
  const outputAvailable =
    job.status === "completed" &&
    job.resultWikitext !== null &&
    (!job.expiresAt || new Date(job.expiresAt).getTime() > Date.now());

  return {
    id: job.id,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    source: {
      wiki: job.sourceWiki,
      title: job.sourceTitle,
      pageId: job.sourcePageId,
      revisionId: job.sourceRevisionId,
      url: job.sourceUrl,
    },
    targetWiki: job.targetWiki,
    counts: {
      totalChunks: job.totalChunks,
      completedChunks: job.completedChunks,
      failedChunks: job.failedChunks,
      totalUnits: job.totalUnits,
      translatedUnits: job.translatedUnits,
    },
    error: job.errorCode
      ? { code: job.errorCode, message: job.errorMessage ?? "" }
      : null,
    warnings: job.warnings,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    expiresAt: job.expiresAt,
    cancelRequested: Boolean(job.cancelRequestedAt),
    outputAvailable,
  };
}

export function flattenSections(sections: SectionNode[]): SectionNode[] {
  const result: SectionNode[] = [];
  const visit = (nodes: SectionNode[]): void => {
    for (const node of nodes) {
      result.push(node);
      visit(node.children);
    }
  };
  visit(sections);
  return result;
}

export function defaultSelection(sections: SectionNode[]): SectionSelection {
  const state: SectionSelection = { lead: true, sections: {} };
  for (const section of flattenSections(sections)) {
    state.sections[section.id] = { selected: true, ownText: true };
  }
  return state;
}

export function normalizeSelection(
  sections: SectionNode[],
  requested: SectionSelection | undefined,
): SectionSelection {
  const selection = defaultSelection(sections);
  if (!requested) return selection;

  selection.lead = requested.lead;
  for (const section of flattenSections(sections)) {
    const item = requested.sections[section.id];
    if (item) {
      selection.sections[section.id] = {
        selected: item.selected,
        ownText: item.ownText,
      };
    }
  }
  return selection;
}
