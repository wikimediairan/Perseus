/**
 * StderrLogger
 *
 * Same `Logger` contract as Core's `ConsoleLogger`, but every level
 * writes to stderr. This is what keeps the CLI's machine-readable JSON
 * result on stdout uncontaminated by progress/log lines (requirement:
 * "keep machine-readable output separate from normal logs"), so Hermes
 * can safely `JSON.parse(stdout)`.
 */

import type {
  LogEntry,
  Logger,
  LogLevel,
  PipelineStageName,
} from "@perseus/core";

export class StderrLogger implements Logger {
  constructor(private readonly stage?: PipelineStageName) {}

  private log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
  ): void {
    const entry: LogEntry = {
      level,
      message,
      stage: this.stage,
      timestamp: new Date().toISOString(),
      data,
    };
    const prefix = entry.stage ? `[${entry.stage}]` : "[perseus-cli]";
    const suffix = entry.data ? ` ${JSON.stringify(entry.data)}` : "";
    process.stderr.write(
      `${prefix} ${entry.level.toUpperCase()}: ${entry.message}${suffix}\n`,
    );
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
    return new StderrLogger(stage);
  }
}
