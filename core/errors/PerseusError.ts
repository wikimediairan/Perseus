/**
 * PerseusError
 *
 * The single error model used across the entire core engine. Per the
 * Software Specification (Error Handling), every pipeline stage must fail
 * in a way that is attributable to a specific stage rather than silently
 * or generically. `PerseusError` carries a `category` and, where relevant,
 * the `stage` in which it occurred, so the UI layer can present a
 * meaningful, actionable message without needing a stack trace.
 *
 * This file defines the error MODEL only. Recovery/retry behavior is
 * explicitly out of scope for this phase.
 */

import type { PipelineStageName } from "@core/pipeline/PipelineStage";

/**
 * Broad error categories. Kept intentionally small and mapped 1:1 to the
 * kinds of failure described in the specification's Error Handling
 * section, rather than to specific implementation exceptions.
 */
export type PerseusErrorCategory =
  | "InputError" // invalid/unreachable URL, unreadable or malformed .wiki file
  | "MergeError" // translated chunks could not be reconciled back into the IR
  | "ParsingError" // Parsoid unavailable or failed to parse the article
  | "ProviderError" // the configured LLM provider rejected or failed a request
  | "NotImplemented" // placeholder for functionality intentionally deferred past this phase
  | "GenerationError" // the IR could not be serialized into valid Wikitext
  | "TranslationError" // an individual chunk failed to translate
  | "ConfigurationError" // missing/invalid configuration (e.g. no provider selected)
  | "LinkResolutionError"; // Wikidata unreachable (distinct from "no Persian equivalent")

export interface PerseusErrorOptions {
  /** The pipeline stage active when the error occurred, if applicable. */
  stage?: PipelineStageName;
  /** The underlying cause, if this error wraps another error. */
  cause?: unknown;
  /**
   * Arbitrary structured context useful for diagnostics/logging.
   * Must never contain secrets (e.g. provider credentials).
   */
  context?: Record<string, unknown>;
}

/**
 * Base error class for all errors raised by the Perseus core engine.
 * UI-facing message text belongs in the message string itself; this class
 * only adds the structured `category`/`stage` attribution on top of the
 * standard `Error` contract.
 */
export class PerseusError extends Error {
  public readonly category: PerseusErrorCategory;
  public readonly stage?: PipelineStageName;
  public readonly context?: Record<string, unknown>;

  constructor(category: PerseusErrorCategory, message: string, options: PerseusErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "PerseusError";
    this.category = category;
    this.stage = options.stage;
    this.context = options.context;
  }
}

/**
 * Convenience helper for functionality intentionally not implemented in
 * this phase (see Software Specification, "What Must NOT Be Implemented").
 * Every placeholder stage/provider should throw this rather than silently
 * returning fabricated data.
 */
export function notImplemented(where: string, stage?: PipelineStageName): never {
  throw new PerseusError(
    "NotImplemented",
    `${where} is not implemented yet (Phase 2 — Project Scaffold contains no business logic).`,
    { stage },
  );
}
