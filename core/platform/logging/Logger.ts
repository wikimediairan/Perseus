/**
 * Logger
 *
 * Minimal, cross-cutting logging abstraction (Software Specification,
 * Logging Strategy). Logging is intentionally simple in this phase:
 * a leveled, stage-aware log line and a single console-backed
 * implementation. No persistence, filtering, or structured sinks yet.
 *
 * Every pipeline stage receives a `Logger` (see PipelineContext) so that
 * stage transitions are always attributable, per the specification's
 * required log points (loading article, parsing, resolving links,
 * translating chunk X/Y, merging, generating Wikitext, finished).
 */

import type { PipelineStageName } from "@core/pipeline/PipelineStage";

export type LogLevel = "info" | "warn" | "debug" | "error";

export interface LogEntry {
  level: LogLevel;
  message: string;
  stage?: PipelineStageName;
  timestamp: string;
  /** Optional structured data, e.g. { current: 3, total: 12 } for chunk progress. */
  data?: Record<string, unknown>;
}

/**
 * The logging contract used throughout the core engine. Consumers (e.g.
 * the pipeline orchestrator, individual stages) depend only on this
 * interface, not on a concrete implementation — see Provider Abstraction
 * for the same pattern applied to LLM providers.
 */
export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;

  /** Returns a child logger pre-scoped to a given pipeline stage. */
  forStage(stage: PipelineStageName): Logger;
}

/**
 * Default Logger implementation: writes to the console. Sufficient for
 * this phase; a future phase may add persistence or a UI-bound sink
 * without changing the `Logger` contract (see Provider Abstraction
 * principle: swapping implementations must not require changes to
 * consumers).
 */
export class ConsoleLogger implements Logger {
  constructor(private readonly stage?: PipelineStageName) {}

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level,
      message,
      stage: this.stage,
      timestamp: new Date().toISOString(),
      data,
    };
    const prefix = entry.stage ? `[${entry.stage}]` : "[perseus]";

    console[level === "debug" ? "log" : level](prefix, entry.message, entry.data ?? "");
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log("debug", message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log("info", message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log("warn", message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.log("error", message, data);
  }

  forStage(stage: PipelineStageName): Logger {
    return new ConsoleLogger(stage);
  }
}
