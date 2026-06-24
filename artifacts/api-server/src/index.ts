import { WebSocket } from "ws";
if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as unknown as Record<string, unknown>).WebSocket = WebSocket;
}

import { env } from "./config/env.js";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { migrateUnencryptedKeys } from "./routes/keys.js";

app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, node_env: env.NODE_ENV },
    "🚀 Server listening"
  );

  migrateUnencryptedKeys().catch((e) =>
    logger.error({ e }, "Key migration failed")
  );
});