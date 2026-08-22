/**
 * shared/errors.ts
 *
 * Domain errors (`PerseusError`, thrown by `@perseus/core`) and backend
 * errors (`BackendError`, e.g. auth/quota/rate-limit — concerns Core
 * has no notion of) are mapped to HTTP responses here. Core owns the
 * `PerseusError` type itself now — this file no longer redeclares it,
 * only the HTTP-mapping concern on top of it.
 */

import type { PerseusErrorCategory } from "@perseus/core";
import { PerseusError } from "@perseus/core";
import {
  CLIENT_SAFE_ERROR_CONTEXT_KEYS,
  LOGGABLE_ERROR_CONTEXT_KEYS,
} from "@/constants/errors";

export type { PerseusErrorCategory };
export { PerseusError };

export type BackendErrorCategory =
  | "AuthError"
  | "QuotaExceededError"
  | "RateLimitError"
  | "NotFoundError"
  | "ConflictError"
  | "ForbiddenError";

type AnyErrorCategory = PerseusErrorCategory | BackendErrorCategory;

export class BackendError extends Error {
  public readonly category: BackendErrorCategory;

  public readonly context?: Record<string, unknown>;

  constructor(
    category: BackendErrorCategory,
    message: string,
    context?: Record<string, unknown>,
  ) {
    super(message);

    this.name = "BackendError";
    this.category = category;
    this.context = context;
  }
}

export interface ErrorEnvelope {
  error: {
    category: AnyErrorCategory | "InternalError";
    message: string;
    requestId: string;
    /**
     * Whether the underlying failure looks transient (upstream 429/5xx,
     * network error) as opposed to permanent (e.g. a 403/404). Lets
     * Desktop decide whether to offer "try again" without exposing the
     * real upstream status or response body. Omitted when unknown.
     */
    retryable?: boolean;
  };
}

/**
 * `Core`'s `PerseusErrorCategory` grew (MergeError/GenerationError/
 * TranslationError/LinkResolutionError/NotImplemented) once the backend
 * started delegating chunking/translation/reconstruction to Core's
 * Pipeline — those failure modes can now genuinely reach the backend,
 * so they need an HTTP status too, even though the old backend-only
 * PerseusError could never throw them.
 */
const STATUS_BY_CATEGORY: Record<AnyErrorCategory, number> = {
  AuthError: 401,
  QuotaExceededError: 429,
  RateLimitError: 429,
  NotFoundError: 404,
  ConflictError: 409,
  ForbiddenError: 403,
  InputError: 400,
  ParsingError: 502,
  ProviderError: 502,
  ConfigurationError: 500,
  MergeError: 502,
  GenerationError: 502,
  TranslationError: 502,
  LinkResolutionError: 502,
  // A submitted translation's embedded chunk identity doesn't match the
  // target chunk — a client-supplied mismatch, not an upstream/internal
  // failure, so 409 Conflict (the submission conflicts with the resource
  // it's being applied to) rather than the 5xx family used above.
  ChunkIdentityError: 409,
  NotImplemented: 501,
};

function pickContext(
  context: Record<string, unknown> | undefined,
  allowedKeys: Set<string>,
): Record<string, unknown> | undefined {
  if (!context) return;

  const out: Record<string, unknown> = {};

  for (const key of Object.keys(context)) {
    if (allowedKeys.has(key)) {
      out[key] = context[key];
    }
  }

  return Object.keys(out).length === 0 ? undefined : out;
}

function sanitizeContext(
  context: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  return pickContext(context, LOGGABLE_ERROR_CONTEXT_KEYS);
}

function clientSafeRetryable(
  context: Record<string, unknown> | undefined,
): boolean | undefined {
  const picked = pickContext(context, CLIENT_SAFE_ERROR_CONTEXT_KEYS);
  const retryable = picked?.retryable;
  return typeof retryable === "boolean" ? retryable : undefined;
}

export function toHttpError(
  err: unknown,
  requestId: string,
): {
  status: number;
  body: ErrorEnvelope;
  logContext?: Record<string, unknown>;
} {
  if (err instanceof PerseusError) {
    const status =
      err.category === "InputError" && err.context?.notFound === true
        ? 404
        : STATUS_BY_CATEGORY[err.category];

    return {
      status,
      body: {
        error: {
          category: err.category,
          message: err.message,
          requestId,
          retryable: clientSafeRetryable(err.context),
        },
      },
      logContext: sanitizeContext({
        stage: err.stage,
        ...err.context,
      }),
    };
  }

  if (err instanceof BackendError) {
    return {
      status: STATUS_BY_CATEGORY[err.category],
      body: {
        error: {
          category: err.category,
          message: err.message,
          requestId,
          retryable: clientSafeRetryable(err.context),
        },
      },
      logContext: sanitizeContext(err.context),
    };
  }

  return {
    status: 500,
    body: {
      error: {
        category: "InternalError",
        message: "An internal error occurred.",
        requestId,
      },
    },
  };
}
