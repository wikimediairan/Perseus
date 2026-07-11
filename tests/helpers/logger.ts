import type { Logger } from "@core/logging/Logger";

/**
 * A real Logger implementation (not a ConsoleLogger monkey-patch) whose
 * forStage() children all write into the SAME shared array — necessary
 * because ConsoleLogger.forStage() constructs a brand-new instance that
 * wouldn't inherit a post-construction override of .warn on the parent.
 */
export function createCapturingLogger(): { logger: Logger; warnings: string[] } {
  const warnings: string[] = [];
  function build(): Logger {
    return {
      debug: () => undefined,
      info: () => undefined,
      warn: (message: string) => {
        warnings.push(message);
      },
      error: () => undefined,
      forStage: () => build(),
    };
  }
  return { logger: build(), warnings };
}
