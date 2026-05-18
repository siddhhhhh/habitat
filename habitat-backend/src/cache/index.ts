import { redisConfigured, isTest } from "../config/env";
import { getRedisConnection } from "../config/redis";
import { MemoryStore } from "./memoryStore";
import { RedisStore } from "./redisStore";
import type { CacheStore } from "./store";

/**
 * Single cache facade used by services. Picks the store lazily so importing
 * this module does no I/O.
 *
 * Why a singleton: many services hold a reference and the test suite needs to
 * be able to swap the store (`__setStore` below) without rebuilding callers.
 */

let store: CacheStore | null = null;

const buildStore = (): CacheStore => {
  if (!isTest && redisConfigured()) {
    try {
      return new RedisStore(getRedisConnection());
    } catch (err) {
      console.warn(
        "[cache] Redis unavailable, falling back to in-memory:",
        (err as Error).message
      );
    }
  }
  return new MemoryStore();
};

const getStore = (): CacheStore => {
  if (!store) store = buildStore();
  return store;
};

/** Test-only seam to swap the store. Never call from production code. */
export const __setStore = (s: CacheStore | null) => {
  store = s;
};

/** Read a JSON-serialisable value. Returns undefined on miss/parse-fail. */
export const cacheGet = <T>(key: string): Promise<T | undefined> => getStore().get<T>(key);

/** Write with a hard TTL and optional invalidation tags. */
export const cacheSet = <T>(
  key: string,
  value: T,
  ttlSeconds: number,
  tags: string[] = []
): Promise<void> => getStore().set(key, value, ttlSeconds, tags);

export const cacheDel = (key: string): Promise<void> => getStore().del(key);

/**
 * Wipe every entry tagged with `tag`. Returns the count of deleted entries
 * (best-effort; on the Redis store the SET could shrink concurrently).
 */
export const invalidateTag = (tag: string): Promise<number> =>
  getStore().invalidateTag(tag);

/**
 * Read-through helper. On hit returns the cached value; on miss runs the
 * loader, caches the result for `ttlSeconds`, and returns it.
 *
 * The single in-flight loader is intentionally unguarded — a moderate
 * thundering-herd is acceptable for our read sizes, and adding a per-key
 * mutex would only bite under cache cold-start at high QPS, which we don't
 * realistically see.
 */
export const getOrSet = async <T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
  tags: string[] = []
): Promise<T> => {
  const cached = await cacheGet<T>(key);
  if (cached !== undefined) return cached;
  const value = await loader();
  await cacheSet(key, value, ttlSeconds, tags);
  return value;
};

/** Tag namespace constants — keep callers from typo'ing each other. */
export const CacheTags = {
  Amenities: "amenities",
  Notices: "notices",
} as const;
