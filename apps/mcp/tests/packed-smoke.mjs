import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = await mkdtemp(path.join(tmpdir(), "perseus-mcp-packed-"));
let tarball = process.argv[2] ? path.resolve(process.argv[2]) : undefined;

function packResult(output) {
  const start = output.lastIndexOf("\n[");
  return JSON.parse(output.slice(start === -1 ? 0 : start + 1))[0];
}

try {
  if (!tarball) {
    const packed = packResult(
      execFileSync("npm", ["pack", "--json", "--pack-destination", root], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "inherit"],
      }),
    );
    tarball = path.join(root, packed.filename);
  }

  await writeFile(path.join(root, "package.json"), '{"private":true}\n');
  execFileSync(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--prefix",
      root,
      tarball,
    ],
    { stdio: "inherit" },
  );
  await writeFile(
    path.join(root, "package.json"),
    '{"private":true,"type":"module"}\n',
  );

  const packageRoot = path.join(
    root,
    "node_modules",
    "@wikimediairan",
    "perseus-mcp",
  );
  async function installedFiles(directory, prefix = "") {
    const files = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = path.join(prefix, entry.name);
      if (entry.isDirectory())
        files.push(
          ...(await installedFiles(path.join(directory, entry.name), relative)),
        );
      else files.push(relative.replaceAll(path.sep, "/"));
    }
    return files;
  }
  const files = (await installedFiles(packageRoot)).sort();
  assert.deepEqual(files, [
    "AGENT_GUIDE.md",
    "LICENSE",
    "README.md",
    "dist/index.js",
    "dist/index.js.map",
    "package.json",
  ]);
  const manifest = JSON.parse(
    await readFile(path.join(packageRoot, "package.json"), "utf8"),
  );
  const bundlePath = path.join(packageRoot, "dist", "index.js");
  const bundle = await readFile(bundlePath, "utf8");
  assert.equal(bundle.startsWith("#!/usr/bin/env node\n"), true);
  assert.deepEqual(manifest.bin, { "perseus-mcp": "./dist/index.js" });
  assert.equal(JSON.stringify(manifest).includes("workspace:*"), false);
  assert.equal(bundle.includes("@perseus/core"), false);
  assert.equal(/from\s*["']\.\.\//.test(bundle), false);

  const requireFromInstall = createRequire(path.join(root, "package.json"));
  assert.throws(() => requireFromInstall.resolve("@perseus/core"));
  for (const dependency of [
    "@modelcontextprotocol/sdk/client/index.js",
    "linkedom",
    "proper-lockfile",
    "zod",
  ]) {
    assert.equal(
      (await realpath(requireFromInstall.resolve(dependency))).startsWith(root),
      true,
    );
  }

  const preload = path.join(root, "mock-wikimedia.mjs");
  await writeFile(
    preload,
    `globalThis.fetch=async(input)=>{const url=String(input instanceof Request?input.url:input);if(url.includes('/w/rest.php/v1/page/'))return new Response(JSON.stringify({source:'Hello world.',title:'Example',id:42,latest:{id:101}}),{status:200,headers:{'Content-Type':'application/json'}});if(url.includes('/w/rest.php/v1/revision/101/html'))return new Response('<html><body><p>Hello world.</p></body></html>',{status:200});if(url.includes('/transform/html/to/wikitext/'))return new Response('Translated wikitext',{status:200});throw new Error('Unexpected mocked request: '+url)};\n`,
  );
  const dataDir = path.join(root, "data");
  const sdkClient = await import(
    pathToFileURL(
      requireFromInstall.resolve("@modelcontextprotocol/sdk/client/index.js"),
    ).href
  );
  const sdkStdio = await import(
    pathToFileURL(
      requireFromInstall.resolve("@modelcontextprotocol/sdk/client/stdio.js"),
    ).href
  );
  const bin = path.join(
    root,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "perseus-mcp.cmd" : "perseus-mcp",
  );
  const transport = new sdkStdio.StdioClientTransport({
    command: bin,
    cwd: root,
    env: {
      PATH: process.env.PATH ?? "",
      NODE_OPTIONS: `--import=${pathToFileURL(preload).href}`,
      PERSEUS_MCP_DATA_DIR: dataDir,
    },
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });
  const protocolErrors = [];
  transport.onerror = (error) => protocolErrors.push(error);
  const client = new sdkClient.Client({
    name: "packed-smoke",
    version: "1.0.0",
  });
  await client.connect(transport);
  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map(({ name }) => name).sort(), [
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
  const accepted = await client.callTool({
    name: "submit_translation_chunk",
    arguments: {
      sessionId,
      chunkId: chunk.chunkId,
      translatedContent: chunk.sourceContent,
      version: chunk.version,
    },
  });
  assert.equal(accepted.structuredContent.accepted, true);
  const exported = await client.callTool({
    name: "export_translation",
    arguments: { sessionId },
  });
  assert.equal(exported.structuredContent.progress.exportReady, true);
  await client.close();
  assert.deepEqual(protocolErrors, []);
  assert.match(stderr, /\[perseus/);
  assert.equal(transport.pid, null);
  console.log(
    JSON.stringify(
      { tarball, size: (await stat(tarball)).size, files },
      null,
      2,
    ),
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
