const PAGE_SOURCE_PATH = "/w/rest.php/v1/page/";
const WIKITEXT_TO_HTML_PATH = "/api/rest_v1/transform/wikitext/to/html/";
const HTML_TO_WIKITEXT_PATH = "/api/rest_v1/transform/html/to/wikitext/";
const WIKIDATA_HOST = "wikidata.org";
const OLLAMA_CHAT_PATH = "/api/chat";

export function isPageSourceRequest(url: string): boolean {
  return url.includes(PAGE_SOURCE_PATH);
}

export function isWikitextToHtmlRequest(url: string): boolean {
  return url.includes(WIKITEXT_TO_HTML_PATH);
}

export function isHtmlToWikitextRequest(url: string): boolean {
  return url.includes(HTML_TO_WIKITEXT_PATH);
}

export function isWikidataRequest(url: string): boolean {
  return url.includes(WIKIDATA_HOST);
}

export function isOllamaChatRequest(url: string): boolean {
  return url.includes(OLLAMA_CHAT_PATH);
}
