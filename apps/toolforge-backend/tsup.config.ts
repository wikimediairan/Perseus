import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    api: "src/api.ts",
    worker: "src/worker.ts",
    migrate: "src/migrate.ts",
  },
  format: ["esm"],
  platform: "node",
  target: "node20",
  sourcemap: true,
  clean: true,
  splitting: false,
  dts: false,
  // Core is a workspace package. Build it first (see the app README / package
  // scripts); tsup then bundles its dist into this app's output.
  noExternal: ["@perseus/core"],
  external: ["@hono/node-server", "hono", "linkedom", "mysql2", "zod"],
});
