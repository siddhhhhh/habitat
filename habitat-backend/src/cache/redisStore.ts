import type { Redis } from "ioredis";
import type { CacheStore } from "./store";

const TAG_PREFIX = "cache:tag:";

/**
 * Redis-backed cache store.
 *
 * Tags are tracked as Redis sets (`cache:tag:<tag>`) whose members are the
 * cached keys carrying that tag. Invalidation unions the set, DELs every key,
 * then DELs the set itself. The set is created with the same TTL as the entry
 * so it doesn't linger after the underlying keys expire.
 */
export class RedisStore implements CacheStore {
  constructor(private redis: Redis) {}

  async get<T>(key: string): Promise<T | undefined> {
    const raw = await this.redis.get(key);
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number, tags: string[] = []): Promise<void> {
    const payload = JSON.stringify(value);
    const pipeline = this.redis.multi();
    pipeline.set(key, payload, "EX", ttlSeconds);
    for (const tag of tags) {
      const tagKey = TAG_PREFIX + tag;
      pipeline.sadd(tagKey, key);
      // Keep tag index alive at least as long as the entry; on next set it gets bumped.
      pipeline.expire(tagKey, Math.max(ttlSeconds, 60));
    }
    await pipeline.exec();
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async invalidateTag(tag: string): Promise<number> {
    const tagKey = TAG_PREFIX + tag;
    const keys = await this.redis.smembers(tagKey);
    if (keys.length === 0) {
      await this.redis.del(tagKey);
      return 0;
    }
    const pipeline = this.redis.multi();
    for (const k of keys) pipeline.del(k);
    pipeline.del(tagKey);
    await pipeline.exec();
    return keys.length;
  }

  async clear(): Promise<void> {
    // Intentionally narrow — production-safety. Only clears entries we know
    // about via tag index. A blanket FLUSHDB would wipe BullMQ and rate
    // limiters living in the same instance.
    const keys = await this.redis.keys(`${TAG_PREFIX}*`);
    for (const tagKey of keys) {
      const cached = await this.redis.smembers(tagKey);
      if (cached.length) await this.redis.del(...cached);
      await this.redis.del(tagKey);
    }
  }
}
