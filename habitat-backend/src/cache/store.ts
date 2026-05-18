/**
 * Cache store interface. Two implementations exist:
 *  - RedisStore (multi-node, persistent through restarts up to TTL)
 *  - MemoryStore (process-local, used in tests and when REDIS_URL is unset)
 *
 * The wrapper at ../cache/index.ts picks one at boot based on env, so the rest
 * of the codebase always talks to a single, identical surface.
 */
export interface CacheStore {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T = unknown>(key: string, value: T, ttlSeconds: number, tags?: string[]): Promise<void>;
  del(key: string): Promise<void>;
  invalidateTag(tag: string): Promise<number>;
  clear(): Promise<void>;
}
