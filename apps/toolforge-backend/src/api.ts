import { serve } from "@hono/node-server";
import { loadConfig } from "./config.js";
import { MariaStore } from "./db/mariaStore.js";
import { createApp } from "./http/app.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const store = new MariaStore(config);
  await store.init();

  const app = createApp({ store, config });
  const server = serve({
    fetch: app.fetch,
    hostname: "0.0.0.0",
    port: config.port,
  });

  const shutdown = (signal: string): void => {
    console.log(`[perseus-api] received ${signal}; shutting down`);
    server.close(() => {
      void store.close().finally(() => process.exit(0));
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  console.log(`[perseus-api] listening on :${config.port}`);
}

main().catch((error) => {
  console.error("[perseus-api] fatal", error);
  process.exitCode = 1;
});
