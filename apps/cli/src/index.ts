/**
 * perseus-cli
 *
 * Headless CLI for automation (Hermes): translate an English Wikipedia
 * article into a target-wiki language via OpenRouter, reusing Perseus
 * Desktop's Core pipeline unchanged. See README.md for usage.
 *
 * IMPORTANT: the DOM polyfill must be installed before any `../*`
 * module that touches DOM globals is imported — Core's Parser/Merger/
 * Generator use `DOMParser`/`Element`/`Document` directly (see
 * dom-polyfill.ts). This import must stay first.
 */
import { installDomPolyfill } from "./dom-polyfill";

installDomPolyfill();

import { DEFAULT_OPENROUTER_MODEL, PerseusError } from "@perseus/core";
import { Command } from "commander";
import { buildPerseusConfig } from "./config";
import { createCliPipeline } from "./pipelineFactory";
import { loadSession } from "./sessionIO";
import { StderrLogger } from "./stderrLogger";
import { runTranslateWorkflow } from "./translateWorkflow";

/** Exit codes, documented for Hermes: 0 = full success, 1 = fatal error (nothing usable produced), 2 = partial success (some chunks failed; Wikitext/session were still written). */
const EXIT_SUCCESS = 0;
const EXIT_FATAL = 1;
const EXIT_PARTIAL = 2;

function printResult(result: unknown): void {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function printFatalError(error: unknown): never {
  const payload =
    error instanceof PerseusError
      ? {
          error: true,
          category: error.category,
          message: error.message,
          stage: error.stage,
        }
      : {
          error: true,
          category: "Unknown",
          message: error instanceof Error ? error.message : String(error),
        };

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exitCode = EXIT_FATAL;
  return undefined as never;
}

const program = new Command();

program
  .name("perseus-cli")
  .description(
    "Translate an English Wikipedia article via OpenRouter, producing a Wikitext .txt and a Perseus Desktop-compatible Translation Session .json.",
  )
  .version("0.1.0");

program
  .command("translate")
  .description("Translate a new article, starting a fresh Translation Session.")
  .argument(
    "<wikipedia-url>",
    "English Wikipedia article URL, e.g. https://en.wikipedia.org/wiki/Example",
  )
  .option(
    "--model <model>",
    "OpenRouter model to use",
    DEFAULT_OPENROUTER_MODEL,
  )
  .option(
    "--output <dir>",
    "Output directory for the .txt and .session.json files",
    "./output",
  )
  .option("--target-wiki <code>", "Target wiki code (fa or tj)", "fa")
  .action(
    async (
      wikipediaUrl: string,
      options: { model: string; output: string; targetWiki: string },
    ) => {
      const logger = new StderrLogger();

      try {
        const config = buildPerseusConfig({
          model: options.model,
          targetWiki: options.targetWiki,
        });
        const pipeline = createCliPipeline(config, logger);

        logger.info(`Loading "${wikipediaUrl}"`);
        const extraction = await pipeline.runToExtraction({
          url: wikipediaUrl,
        });

        const result = await runTranslateWorkflow({
          pipeline,
          extraction,
          outputDir: options.output,
          logger,
        });

        printResult(result);
        process.exitCode =
          result.failedChunks.length > 0 ? EXIT_PARTIAL : EXIT_SUCCESS;
      } catch (error) {
        printFatalError(error);
      }
    },
  );

program
  .command("resume")
  .description(
    "Resume translation from a previously saved Translation Session file.",
  )
  .argument(
    "<session-file>",
    "Path to a .session.json file produced by this CLI (or Perseus Desktop)",
  )
  .option(
    "--model <model>",
    "OpenRouter model to use",
    DEFAULT_OPENROUTER_MODEL,
  )
  .option(
    "--output <dir>",
    "Output directory for the .txt and .session.json files",
    "./output",
  )
  .action(
    async (sessionFile: string, options: { model: string; output: string }) => {
      const logger = new StderrLogger();

      try {
        const existingSession = await loadSession(sessionFile);

        // A resumed session always continues as whatever target wiki it was
        // created for (see ../pipeline/Pipeline.ts, reconstructFromRevision),
        // not whatever the CLI's default currently is.
        const config = buildPerseusConfig({
          model: options.model,
          targetWiki: existingSession.meta.targetWiki,
        });
        const pipeline = createCliPipeline(config, logger);

        logger.info(
          `Reconstructing "${existingSession.source.title}" from revision ${existingSession.source.revisionId}`,
        );
        const extraction = await pipeline.reconstructFromRevision(
          existingSession.source,
          existingSession.meta.targetWiki,
        );

        const result = await runTranslateWorkflow({
          pipeline,
          extraction,
          existingSession,
          outputDir: options.output,
          logger,
        });

        printResult(result);
        process.exitCode =
          result.failedChunks.length > 0 ? EXIT_PARTIAL : EXIT_SUCCESS;
      } catch (error) {
        printFatalError(error);
      }
    },
  );

program.parseAsync(process.argv);
