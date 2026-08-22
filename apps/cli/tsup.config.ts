import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "tsup";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  entry: { cli: "src/index.ts" },
  format: ["esm"],
  platform: "node",
  target: "node18",
  clean: true,
  splitting: false,
  sourcemap: true,
  dts: false,
  banner: { js: "#!/usr/bin/env node" },
  esbuildOptions(options) {
    options.alias = {
      "@cli": path.join(__dirname, "src/cli"),
    };
  },
});
