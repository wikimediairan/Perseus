import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "tsdown";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
  version: string;
};

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  clean: true,
  sourcemap: true,
  dts: false,
  define: {
    __PACKAGE_VERSION__: JSON.stringify(packageJson.version),
  },
  alias: {
    "@perseus/core": path.resolve("../../packages/core/dist/index.js"),
  },
  external: ["@modelcontextprotocol/sdk", "linkedom", "proper-lockfile", "zod"],
});
