import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const manifest = JSON.parse(await readFile("package.json", "utf8"));
const bundle = await readFile("dist/index.js", "utf8");
const sourceMap = JSON.parse(await readFile("dist/index.js.map", "utf8"));

assert.equal(manifest.name, "@perseus/mcp");
assert.equal(manifest.private, undefined);
assert.equal(manifest.license, "GPL-3.0-or-later");
assert.deepEqual(manifest.bin, { "perseus-mcp": "./dist/index.js" });
assert.deepEqual(Object.keys(manifest.dependencies).sort(), [
  "@modelcontextprotocol/sdk",
  "linkedom",
  "proper-lockfile",
  "zod",
]);
assert.equal(bundle.startsWith("#!/usr/bin/env node\n"), true);
assert.equal((bundle.match(/^#!.*$/gm) ?? []).length, 1);
assert.equal(bundle.includes("@perseus/core"), false);
assert.equal(bundle.includes("workspace:*"), false);
assert.equal(/from\s*["']\.\.\//.test(bundle), false);
assert.equal(
  sourceMap.sources.some((source) => source.includes("packages/core/src")),
  true,
);
assert.equal(sourceMap.sourcesContent?.length, sourceMap.sources.length);
assert.equal((await stat("dist/index.js")).isFile(), true);

console.log("Package build validation passed.");
