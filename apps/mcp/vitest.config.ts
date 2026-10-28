import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

const { version } = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
  version: string;
};

export default defineConfig({
  define: { __PACKAGE_VERSION__: JSON.stringify(version) },
  resolve: {
    alias: {
      "@perseus/core": path.resolve("../../packages/core/dist/index.js"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
