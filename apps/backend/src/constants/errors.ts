export const LOGGABLE_ERROR_CONTEXT_KEYS = new Set([
  "status",
  "stage",
  "chunkId",
  "providerResponse",
  "retryable",
  "upstreamMessage",
]);

/**
 * Context keys safe to return in the CLIENT-facing error envelope (a
 * strict subset of LOGGABLE_ERROR_CONTEXT_KEYS). `status`/`upstreamMessage`
 * stay log-only: the former would leak which upstream (Wikimedia vs.
 * provider) failed and how, the latter is raw third-party response text.
 * Only signal the client actually needs to act on (is this worth
 * retrying?) is exposed.
 */
export const CLIENT_SAFE_ERROR_CONTEXT_KEYS = new Set(["retryable"]);
