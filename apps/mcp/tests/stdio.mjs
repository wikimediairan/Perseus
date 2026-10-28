import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

class ChildProcessTransport {
  onclose;
  onerror;
  onmessage;
  process;
  stderr = "";
  protocolErrors = [];
  buffer = "";

  constructor(options) {
    this.options = options;
  }

  start() {
    return new Promise((resolveStart, reject) => {
      this.process = spawn(this.options.command, this.options.args, {
        cwd: this.options.cwd,
        env: this.options.env,
        stdio: ["pipe", "pipe", "pipe"],
      });
      this.process.once("spawn", resolveStart);
      this.process.once("error", reject);
      this.process.stderr.on("data", (chunk) => {
        this.stderr += String(chunk);
      });
      this.process.stdout.on("data", (chunk) => {
        this.buffer += String(chunk);
        for (;;) {
          const newline = this.buffer.indexOf("\n");
          if (newline === -1) break;
          const line = this.buffer.slice(0, newline);
          this.buffer = this.buffer.slice(newline + 1);
          try {
            this.onmessage?.(JSON.parse(line));
          } catch (error) {
            this.protocolErrors.push({ line, error });
            this.onerror?.(error);
          }
        }
      });
      this.process.once("close", () => this.onclose?.());
    });
  }

  send(message) {
    return new Promise((resolveSend, reject) => {
      this.process.stdin.write(`${JSON.stringify(message)}\n`, (error) =>
        error ? reject(error) : resolveSend(),
      );
    });
  }

  async close() {
    if (!this.process || this.process.exitCode !== null) return;
    const child = this.process;
    const closed = new Promise((resolveClose) =>
      child.once("close", resolveClose),
    );
    child.stdin.end();
    await Promise.race([
      closed,
      new Promise((resolveTimeout) => setTimeout(resolveTimeout, 2000)),
    ]);
    if (child.exitCode === null) child.kill("SIGTERM");
    await closed;
  }

  get pid() {
    return this.process?.exitCode === null ? this.process.pid : null;
  }
}

const dataDir = mkdtempSync(join(tmpdir(), "perseus-mcp-stdio-"));
const preload = pathToFileURL(resolve("tests/mock-wikimedia.mjs")).href;
const transport = new ChildProcessTransport({
  command: process.execPath,
  args: ["dist/index.js"],
  cwd: process.cwd(),
  env: {
    PATH: process.env.PATH ?? "",
    NODE_OPTIONS: `--import=${preload}`,
    PERSEUS_MCP_DATA_DIR: dataDir,
  },
});
const client = new Client({ name: "perseus-test", version: "1.0.0" });

try {
  await client.connect(transport);
  assert.deepEqual(client.getServerVersion(), {
    name: "perseus",
    version: "0.1.0",
  });
  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
    "create_translation",
    "export_translation",
    "get_translation_chunk",
    "get_translation_status",
    "submit_translation_chunk",
  ]);

  const missing = await client.callTool({
    name: "get_translation_status",
    arguments: { sessionId: "00000000-0000-4000-8000-000000000000" },
  });
  assert.equal(missing.isError, true);
  assert.match(missing.content[0].text, /SESSION_NOT_FOUND/);

  const created = await client.callTool({
    name: "create_translation",
    arguments: {
      url: "https://en.wikipedia.org/wiki/Example",
      targetLanguage: "fa",
    },
  });
  const sessionId = created.structuredContent.sessionId;
  const received = await client.callTool({
    name: "get_translation_chunk",
    arguments: { sessionId },
  });
  const chunk = received.structuredContent.chunk;
  const invalid = await client.callTool({
    name: "submit_translation_chunk",
    arguments: {
      sessionId,
      chunkId: chunk.chunkId,
      version: chunk.version,
      translatedContent: chunk.sourceContent.replace("[[SEGMENT 1]]", ""),
    },
  });
  assert.equal(invalid.isError, true);
  assert.equal(invalid.structuredContent.accepted, false);
  const accepted = await client.callTool({
    name: "submit_translation_chunk",
    arguments: {
      sessionId,
      chunkId: chunk.chunkId,
      version: chunk.version,
      translatedContent: chunk.sourceContent,
    },
  });
  assert.equal(accepted.structuredContent.accepted, true);
  const status = await client.callTool({
    name: "get_translation_status",
    arguments: { sessionId },
  });
  assert.deepEqual(status.structuredContent.progress, {
    completed: 1,
    total: 1,
    remaining: 0,
    exportReady: true,
  });
  const exported = await client.callTool({
    name: "export_translation",
    arguments: { sessionId },
  });
  assert.equal(exported.structuredContent.progress.exportReady, true);

  await client.close();
  assert.match(transport.stderr, /\[perseus/);
  assert.deepEqual(transport.protocolErrors, []);
  assert.equal(transport.pid, null);
  console.log(
    "MCP stdio integration passed (5 tools, mocked workflow, clean shutdown). ",
  );
} finally {
  if (transport.pid !== null) await client.close().catch(() => undefined);
  await rm(dataDir, { recursive: true, force: true });
}
