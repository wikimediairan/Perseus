import {
  getTopLevelTemplateName,
  isOutermostTransclusion,
  normalizeTemplateName,
} from "../02-parsing/templateParameters";

export function removeDenylistedTemplates(
  root: Element,
  denylist: readonly string[],
): number {
  if (denylist.length === 0) {
    return 0;
  }

  const normalizedDenylist = new Set(denylist.map(normalizeTemplateName));
  const candidates = [...root.querySelectorAll('[typeof*="mw:Transclusion"]')];
  let removed = 0;

  for (const el of candidates) {
    if (!isOutermostTransclusion(el)) continue;

    const name = getTopLevelTemplateName(el);
    if (name && normalizedDenylist.has(normalizeTemplateName(name))) {
      el.remove();
      removed++;
    }
  }

  return removed;
}
