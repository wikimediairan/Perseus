export function refSup(id: string, dataMw: object, visible = "[1]"): string {
  return `<sup typeof="mw:Extension/ref" data-mw='${JSON.stringify(dataMw)}' id="${id}">${visible}</sup>`;
}

/**
 * Applies `transform` to the body of every `[[SEGMENT n]]` block in a
 * rendered chunk, leaving the segment markers and any placeholder tokens
 * untouched. Used to stub out an LLM's chat response deterministically.
 */
export function translateSegments(
  userMessage: string,
  transform: (text: string) => string,
): string {
  return userMessage.replace(
    /\[\[SEGMENT (\d+)\]\]\n([^\n]*(?:\n(?!\[\[SEGMENT)[^\n]*)*)/g,
    (_match, n: string, text: string) => `[[SEGMENT ${n}]]\n${transform(text)}`,
  );
}
