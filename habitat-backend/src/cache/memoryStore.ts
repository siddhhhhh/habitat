import type { CacheStore } from "./store";

interface Entry {
  value: unknown;
  expiresAt: number; // ms epoch
  tags: string[];
}

/**
 * Process-local cache used when Redis is not configured (dev, tests). Not
 * suitable for multi-instance deployments — invalidation only affects the
 * current Node process — but identical to the Redis store from a caller's
 * perspective.
 *
 * Expiry is lazy: entries past their deadline are evicted on read instead of
 * via a sweeper, which keeps the store free of timers (handy for tests).
 */
export class MemoryStore implements CacheStore {
  private entries = new Map<string, Entry>();
  private tagIndex = new Map<string, Set<string>>();

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      this.dropFromTagIndex(key, entry.tags);
      return undefined;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number, tags: string[] = []): Promise<void> {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    const previous = this.entries.get(key);
    if (previous) this.dropFromTagIndex(key, previous.tags);

    this.entries.set(key, { value, expiresAt, tags });
    for (const tag of tags) {
      let set = this.tagIndex.get(tag);
      if (!set) {
        set = new Set();
        this.tagIndex.set(tag, set);
      }
      set.add(key);
    }
  }

  async del(key: string): Promise<void> {
    const previous = this.entries.get(key);
    if (!previous) return;
    this.entries.delete(key);
    this.dropFromTagIndex(key, previous.tags);
  }

  async invalidateTag(tag: string): Promise<number> {
    const keys = this.tagIndex.get(tag);
    if (!keys) return 0;
    let n = 0;
    for (const key of keys) {
      if (this.entries.delete(key)) n++;
    }
    this.tagIndex.delete(tag);
    return n;
  }

  async clear(): Promise<void> {
    this.entries.clear();
    this.tagIndex.clear();
  }

  private dropFromTagIndex(key: string, tags: string[]) {
    for (const tag of tags) {
      const set = this.tagIndex.get(tag);
      if (!set) continue;
      set.delete(key);
      if (set.size === 0) this.tagIndex.delete(tag);
    }
  }
}
