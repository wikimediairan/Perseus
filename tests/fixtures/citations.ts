export function refSup(id: string, dataMw: object, visible = "[1]"): string {
  return `<sup typeof="mw:Extension/ref" data-mw='${JSON.stringify(dataMw)}' id="${id}">${visible}</sup>`;
}

export function translateSegments(
  userMessage: string,
  transform: (text: string) => string,
): string {
  return userMessage.replace(
    /\[\[SEGMENT (\d+)\]\]\n([^\n]*(?:\n(?!\[\[SEGMENT)[^\n]*)*)/g,
    (_match, n: string, text: string) => `[[SEGMENT ${n}]]\n${transform(text)}`,
  );
}
