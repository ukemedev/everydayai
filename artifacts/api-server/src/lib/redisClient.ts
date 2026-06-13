import { Redis } from "ioredis";

/**
 * Returns a new Redis client for the given URL.
 * Extracted into its own module so tests can mock this function
 * without fighting CJS/ESM interop on the ioredis package.
 */
export function getRedisClient(redisUrl: string): Redis {
  return new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    enableReadyCheck:     false,
  });
}
