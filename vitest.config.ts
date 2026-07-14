import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
  },
  resolve: {
    alias: {
      "@core": path.resolve(__dirname, "./core"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
