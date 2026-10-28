#!/usr/bin/env node
import "./runtime.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WIKIMEDIA_USER_AGENT } from "@perseus/core";
import { createServer } from "./server.js";

// Core's network stages only need these public Wikimedia endpoints. Redirects
// are rejected, and article content cannot choose another fetch destination.
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input.toString());
  if (
    url.protocol !== "https:" ||
    !["en.wikipedia.org", "www.wikidata.org"].includes(url.hostname) ||
    url.port ||
    url.username ||
    url.password
  )
    return Promise.reject(
      new Error(
        "Perseus MCP only accesses public English Wikipedia and Wikidata endpoints.",
      ),
    );
  const headers = new Headers(init?.headers);
  headers.set("User-Agent", WIKIMEDIA_USER_AGENT);
  const timeout = AbortSignal.timeout(30_000);
  return nativeFetch(input, {
    ...init,
    headers,
    redirect: "error",
    signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
  });
};

async function main() {
  if (process.argv.length > 2)
    throw new Error(
      "No command-line arguments are supported. Configure storage with PERSEUS_MCP_DATA_DIR (absolute path).",
    );
  const { server, drain } = createServer();
  let stopping = false;
  const keepAlive = setInterval(() => {}, 2 ** 30);
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(keepAlive);
    await drain();
    await server.close();
    process.stdin.pause();
  };
  const stop = () => {
    void shutdown().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  process.stdin.once("data", () => process.stdin.once("end", stop));
  const transport = new StdioServerTransport();
  transport.onclose = stop;
  await server.connect(transport);
}

main().catch((error) => {
  console.error(
    `[perseus] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
