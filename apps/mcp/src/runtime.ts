import type { Logger, PipelineStageName } from "@perseus/core";
import { DOMParser, Document, Element, Node } from "linkedom";

// Linkedom parses inert markup; it never runs article scripts.
Object.assign(globalThis, { DOMParser, Document, Element, Node });

export class StderrLogger implements Logger {
  constructor(
    readonly warnings: string[] = [],
    private readonly stage?: PipelineStageName,
  ) {}
  debug(message: string): void {
    this.info(message);
  }
  info(message: string): void {
    console.error(`[perseus${this.stage ? `:${this.stage}` : ""}] ${message}`);
  }
  warn(message: string): void {
    if (this.warnings.length < 20) this.warnings.push(message.slice(0, 500));
    this.info(message);
  }
  error(message: string): void {
    this.info(message);
  }
  forStage(stage: PipelineStageName): Logger {
    return new StderrLogger(this.warnings, stage);
  }
}

export class ToolError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
