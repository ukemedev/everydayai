// ─── connection.ts ────────────────────────────────────────────────
// Redis connections for BullMQ
//
// WHY two connections:
// → Producer connection (used by Queue to add jobs):
//   maxRetriesPerRequest = 1 → user gets error fast if Redis is down
//
// → Worker connection (used by Worker to process jobs):
//   maxRetriesPerRequest = null → worker waits forever for Redis
//   This is required by BullMQ — without it ioredis throws errors
//
// SOURCE: https://docs.bullmq.io/guide/connections
//
// CRITICAL: Never use keyPrefix in ioredis with BullMQ —
// BullMQ has its own key prefixing via the prefix option
// ─────────────────────────────────────────────────────────────────

import { Redis } from "ioredis";
import { logger } from "../lib/logger";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

// ── Producer connection ───────────────────────────────────────────
// Used by Queue instances to ADD jobs
// maxRetriesPerRequest: 1 → fail fast so API can return error to user
export const producerConnection = new Redis(redisUrl, {
  maxRetriesPerRequest: 1,
  enableReadyCheck: false,
});

// ── Worker connection ─────────────────────────────────────────────
// Used by Worker instances to PROCESS jobs
// maxRetriesPerRequest: null → wait forever — required by BullMQ
export const workerConnection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// ── Connection event logging ──────────────────────────────────────
producerConnection.on("connect", () => {
  logger.info("Redis producer connected");
});

producerConnection.on("error", (err) => {
  logger.error({ err }, "Redis producer error");
});

workerConnection.on("connect", () => {
  logger.info("Redis worker connected");
});

workerConnection.on("error", (err) => {
  logger.error({ err }, "Redis worker error");
});
