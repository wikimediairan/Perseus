/**
 * retryingProvider
 *
 * A small decorator around Core's `TextProviderType` that retries a
 * failed `translate()` call a limited number of times with a short
 * backoff, before giving up and letting the error propagate.
 *
 * Kept OUTSIDE Core deliberately (per the "keep Core changes minimal"
 * priority): Core's `chatProtocol.ts`/`OpenRouterProvider.ts` already
 * turn transport/HTTP failures into a `PerseusError("ProviderError", ...)`
 * — this module only adds retry behavior on top of that contract,
 * without touching how the request/response is built or parsed. Retries
 * are limited to `ProviderError` (transient network/HTTP failures);
 * `ConfigurationError` (e.g. missing API key) is never retried since
 * retrying cannot fix it.
 */

import type {
  TextProviderType,
  TranslationRequest,
  TranslationResult,
} from "@perseus/core";
import { PerseusError } from "@perseus/core";

export interface RetryOptions {
  maxAttempts?: number;
  /** Base delay in ms; actual delay grows linearly with attempt number. */
  delayMs?: number;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class RetryingProvider implements TextProviderType {
  readonly kind: TextProviderType["kind"];

  constructor(
    private readonly inner: TextProviderType,
    private readonly options: RetryOptions = {},
  ) {
    this.kind = inner.kind;
  }

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    const maxAttempts = this.options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const delayMs = this.options.delayMs ?? DEFAULT_DELAY_MS;

    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.inner.translate(request);
      } catch (error) {
        lastError = error;

        const isRetryable =
          error instanceof PerseusError && error.category === "ProviderError";

        if (!isRetryable || attempt === maxAttempts) {
          throw error;
        }

        await sleep(delayMs * attempt);
      }
    }

    // Unreachable, but keeps TypeScript happy about the return type.
    throw lastError;
  }
}
