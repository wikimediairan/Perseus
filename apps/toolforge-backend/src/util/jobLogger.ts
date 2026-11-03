import type { Logger, LogLevel, PipelineStageName } from "@perseus/core";

export type EventAppender = (
  level: LogLevel,
  code: string,
  message: string,
  data?: Record<string, unknown>,
) => Promise<unknown>;

export class JobLogger implements Logger {
  constructor(
    private readonly append: EventAppender,
    private readonly stage?: PipelineStageName,
    private readonly pending: Promise<unknown>[] = [],
    readonly warnings: string[] = [],
  ) {}

  private log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
  ): void {
    if (level === "warn") {
      this.warnings.push(message.slice(0, 500));
    }

    const code = this.stage ? `STAGE_${this.stage.toUpperCase()}` : "PIPELINE";
    this.pending.push(
      this.append(level, code, message, data).catch(() => undefined),
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
    return new JobLogger(this.append, stage, this.pending, this.warnings);
  }

  async flush(): Promise<void> {
    await Promise.all(this.pending);
    this.pending.length = 0;
  }
}
