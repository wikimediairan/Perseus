import type { PipelineStageName } from "../../pipeline/PipelineStage";

export type PerseusErrorCategory =
  | "InputError"
  | "MergeError"
  | "ParsingError"
  | "ProviderError"
  | "NotImplemented"
  | "GenerationError"
  | "TranslationError"
  | "ConfigurationError"
  | "LinkResolutionError"
  | "ChunkIdentityError";

export interface PerseusErrorOptions {
  stage?: PipelineStageName;

  cause?: unknown;

  context?: Record<string, unknown>;
}

export class PerseusError extends Error {
  public readonly category: PerseusErrorCategory;
  public readonly stage?: PipelineStageName;
  public readonly context?: Record<string, unknown>;

  constructor(
    category: PerseusErrorCategory,
    message: string,
    options: PerseusErrorOptions = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "PerseusError";
    this.category = category;
    this.stage = options.stage;
    this.context = options.context;
  }
}

export function notImplemented(
  where: string,
  stage?: PipelineStageName,
): never {
  throw new PerseusError(
    "NotImplemented",
    `${where} is not implemented yet (Phase 2 — Project Scaffold contains no business logic).`,
    { stage },
  );
}
