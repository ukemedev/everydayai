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
//
// NOTE: Redis is optional. If REDIS_URL is not set, connections
// are null and queues will not be available. The app degrades
// gracefully — synchronous in-process calls are used instead.
// ─────────────────────────────────────────────────────────────────

import { Redis } from "ioredis";
import { logger } from "../lib/logger";

const redisUrl = process.env.REDIS_URL;

let _producerConnection: Redis | null = null;
let _workerConnection: Redis | null = null;

if (redisUrl) {
  // ── Producer connection ─────────────────────────────────────────
  // Used by Queue instances to ADD jobs
  // maxRetriesPerRequest: 1 → fail fast so API can return error to user
  _producerConnection = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
  });

  // ── Worker connection ───────────────────────────────────────────
  // Used by Worker instances to PROCESS jobs
  // maxRetriesPerRequest: null → wait forever — required by BullMQ
  _workerConnection = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  // ── Connection event logging ────────────────────────────────────
  _producerConnection.on("connect", () => {
    logger.info("Redis producer connected");
  });

  _producerConnection.on("error", (err) => {
    logger.error({ err }, "Redis producer error");
  });

  _workerConnection.on("connect", () => {
    logger.info("Redis worker connected");
  });

  _workerConnection.on("error", (err) => {
    logger.error({ err }, "Redis worker error");
  });
} else {
  logger.warn("REDIS_URL not set — BullMQ queues are disabled. AI calls will run synchronously.");
}

export const producerConnection = _producerConnection;
export const workerConnection = _workerConnection;
