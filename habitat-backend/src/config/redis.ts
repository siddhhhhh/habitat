import IORedis, { Redis, RedisOptions } from "ioredis";
import { env, redisConfigured } from "./env";

let connection: Redis | null = null;

/**
 * Lazy singleton Redis connection used by BullMQ queues and workers.
 *
 * BullMQ requires `maxRetriesPerRequest: null` and `enableReadyCheck: false`
 * so blocking commands (BRPOP, etc.) don't trip the retry watchdog.
 */
export const getRedisConnection = (): Redis => {
  if (!redisConfigured()) {
    throw new Error("Redis is not configured (set REDIS_URL).");
  }
  if (connection) return connection;

  const options: RedisOptions = {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
  connection = new IORedis(env.REDIS_URL, options);

  connection.on("error", (err) => {
    console.error("[redis] connection error:", err.message);
  });
  connection.on("connect", () => {
    console.log("✅ Redis connected");
  });

  return connection;
};

export const closeRedisConnection = async (): Promise<void> => {
  if (!connection) return;
  try {
    await connection.quit();
  } catch {
    connection.disconnect();
  }
  connection = null;
};
