// ─── index.ts ────────────────────────────────────────────────────
// App entry point
//
// CRITICAL: env import must come FIRST — before everything else.
// This validates all secrets on startup.
// If any secret is missing → app exits with a clear error message.
// ─────────────────────────────────────────────────────────────────
import { env } from "./config/env";
import app from "./app";
import { logger } from "./lib/logger";
import { migrateUnencryptedKeys } from "./routes/keys";

app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, node_env: env.NODE_ENV },
    "🚀 Server listening"
  );

  migrateUnencryptedKeys().catch((e) =>
    logger.error({ e }, "Key migration failed")
  );
});
