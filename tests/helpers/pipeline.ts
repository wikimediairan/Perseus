import type { Logger } from "@core/logging/Logger";

export interface OllamaProviderConfig {
  kind: "ollama";
  model: string;
  baseUrl: string;
}

export const OLLAMA_TEST_PROVIDER: OllamaProviderConfig = {
  kind: "ollama",
  model: "llama3",
  baseUrl: "http://localhost:11434",
};

export const SUN_ARTICLE_REQUEST = {
  kind: "url" as const,
  url: "https://en.wikipedia.org/wiki/Sun",
};

export async function loadPipelineModules() {
  const [{ createPipeline }, { DEFAULT_CONFIG }, { ConsoleLogger }] = await Promise.all([
    import("@core/createPipeline"),
    import("@core/config/Config"),
    import("@core/logging/Logger"),
  ]);
  return { createPipeline, DEFAULT_CONFIG, ConsoleLogger };
}

export async function createOllamaPipeline(logger?: Logger) {
  const { createPipeline, DEFAULT_CONFIG, ConsoleLogger } = await loadPipelineModules();
  const config = { ...DEFAULT_CONFIG, activeProvider: OLLAMA_TEST_PROVIDER };
  return createPipeline(config, logger ?? new ConsoleLogger());
}
