export function setGlobalFetch(handler: typeof fetch): void {
  (globalThis as unknown as { fetch: typeof fetch }).fetch = handler;
}

export function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

export function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response;
}

export function textResponse(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
    json: () => Promise.resolve({}),
  } as Response;
}

export function parseJsonBody<T>(init: RequestInit | undefined): T | undefined {
  if (typeof init?.body !== "string") return undefined;
  try {
    return JSON.parse(init.body) as T;
  } catch {
    return undefined;
  }
}

/**
 * The `html/to/wikitext` endpoint is the reconstruction/generation step in
 * nearly every pipeline test. Centralizing the "capture the request body,
 * return a fixed wikitext result" behavior avoids reimplementing it per file.
 */
export function createHtmlToWikitextCapture(resultWikitext = "GENERATED") {
  let capturedHtml = "";
  const handle = (init?: RequestInit): Response => {
    const body = parseJsonBody<{ html?: string }>(init);
    if (typeof body?.html === "string") capturedHtml = body.html;
    return textResponse(resultWikitext);
  };
  return { handle, getCapturedHtml: () => capturedHtml };
}
