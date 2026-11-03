/**
 * Build a deployable directory for Toolforge.
 *
 * The monorepo uses pnpm workspace:* for @perseus/core. That specifier is not
 * installable by npm on Toolforge, and Core is bundled into dist/worker.js
 * anyway. This script copies dist + migrations and writes a clean production
 * package.json with only the external runtime dependencies.
 */
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(
  fileURLToPath(new URL("../package.json", import.meta.url)),
);
const outDir = path.join(appDir, "toolforge-dist");
const packageJson = JSON.parse(
  await readFile(path.join(appDir, "package.json"), "utf8"),
);

const runtimeDependencies = { ...packageJson.dependencies };
delete runtimeDependencies["@perseus/core"];

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

await cp(path.join(appDir, "dist"), path.join(outDir, "dist"), {
  recursive: true,
});
await cp(path.join(appDir, "migrations"), path.join(outDir, "migrations"), {
  recursive: true,
});
await cp(path.join(appDir, "README.md"), path.join(outDir, "README.md"));
await cp(
  path.join(appDir, "service.template"),
  path.join(outDir, "service.template"),
);

await writeFile(
  path.join(outDir, "package.json"),
  `${JSON.stringify(
    {
      name: "perseus-toolforge-runtime",
      version: packageJson.version,
      private: true,
      type: "module",
      engines: { node: ">=20" },
      scripts: {
        start: "node dist/api.js",
        "start:worker": "node dist/worker.js",
        migrate: "node dist/migrate.js",
      },
      dependencies: runtimeDependencies,
    },
    null,
    2,
  )}\n`,
);

console.log(`Toolforge deployment directory written to ${outDir}`);
