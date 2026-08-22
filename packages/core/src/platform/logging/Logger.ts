import type { PipelineStageName } from "../../pipeline/PipelineStage";

export type LogLevel = "info" | "warn" | "debug" | "error";

export interface LogEntry {
  level: LogLevel;
  message: string;
  stage?: PipelineStageName;
  timestamp: string;

  data?: Record<string, unknown>;
}

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;

  forStage(stage: PipelineStageName): Logger;
}

export class ConsoleLogger implements Logger {
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
    const prefix = entry.stage ? `[${entry.stage}]` : "[perseus]";

    console[level === "debug" ? "log" : level](
      prefix,
      entry.message,
      entry.data ?? "",
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
    return new ConsoleLogger(stage);
  }
}
