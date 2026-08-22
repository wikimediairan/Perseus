import type { PipelineStageName } from "@perseus/core";

export type LogLevel = "info" | "warn" | "debug" | "error";

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  forStage(stage: PipelineStageName): Logger;
}

export class RequestLogger implements Logger {
  constructor(
    private readonly requestId: string,
    private readonly stage?: PipelineStageName,
  ) {}

  private log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
  ): void {
    const line = {
      level,
      message,
      requestId: this.requestId,
      stage: this.stage,
      timestamp: new Date().toISOString(),
      ...(data ? { data } : {}),
    };
    const method = level === "debug" ? "log" : level;
    console[method](JSON.stringify(line));
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
    return new RequestLogger(this.requestId, stage);
  }
}
