import {
  __setStore,
  cacheGet,
  cacheSet,
  cacheDel,
  getOrSet,
  invalidateTag,
} from "../cache";
import { MemoryStore } from "../cache/memoryStore";
import { connectTestDb, disconnectTestDb, clearTestDb } from "./helpers/db";
import { createUser } from "./helpers/factories";
import { UserRole } from "../utils/enums";
import { AmenitiesService } from "../services/amenities.service";
import { getAllNotices, createNotice } from "../services/notice.service";

beforeAll(async () => {
  await connectTestDb();
});

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  __setStore(new MemoryStore());
});

describe("MemoryStore primitives", () => {
  it("round-trips a value", async () => {
    await cacheSet("k", { a: 1 }, 60);
    expect(await cacheGet("k")).toEqual({ a: 1 });
  });

  it("returns undefined past TTL", async () => {
    // TTL 0 means expiresAt == now, so the next read is past the deadline.
    await cacheSet("expired", "v", 0);
    expect(await cacheGet("expired")).toBeUndefined();
  });

  it("deletes a key", async () => {
    await cacheSet("k", "v", 60);
    await cacheDel("k");
    expect(await cacheGet("k")).toBeUndefined();
  });

  it("invalidates all keys carrying a tag", async () => {
    await cacheSet("a", 1, 60, ["t"]);
    await cacheSet("b", 2, 60, ["t"]);
    await cacheSet("c", 3, 60, ["other"]);
    const n = await invalidateTag("t");
    expect(n).toBe(2);
    expect(await cacheGet("a")).toBeUndefined();
    expect(await cacheGet("b")).toBeUndefined();
    expect(await cacheGet("c")).toBe(3);
  });
});

describe("getOrSet", () => {
  it("runs the loader on first call and caches the value", async () => {
    const loader = jest.fn().mockResolvedValue("from-db");
    const v1 = await getOrSet("k", 60, loader);
    const v2 = await getOrSet("k", 60, loader);
    expect(v1).toBe("from-db");
    expect(v2).toBe("from-db");
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("re-runs the loader after invalidation", async () => {
    const loader = jest
      .fn()
      .mockResolvedValueOnce("first")
      .mockResolvedValueOnce("second");
    expect(await getOrSet("k", 60, loader, ["t"])).toBe("first");
    await invalidateTag("t");
    expect(await getOrSet("k", 60, loader, ["t"])).toBe("second");
    expect(loader).toHaveBeenCalledTimes(2);
  });
});

describe("Service-level caching: amenities", () => {
  it("getAll caches the result and writes invalidate it", async () => {
    await createUser({ role: UserRole.Admin });
    const svc = new AmenitiesService();

    expect(await svc.getAll()).toEqual([]);
    await svc.create({ name: "Pool" });
    const after = await svc.getAll();
    expect(after.map((a: any) => a.name)).toEqual(["Pool"]);
  });
});

describe("Service-level caching: notices", () => {
  it("createNotice invalidates the list cache", async () => {
    const initial = await getAllNotices();
    expect(initial).toEqual([]);

    await createNotice({
      title: "Boil water",
      description: "today only",
      visibleFrom: new Date(),
      visibleUntil: new Date(Date.now() + 86_400_000),
      pinned: false,
      audience: [UserRole.Resident],
    } as any);

    const after = await getAllNotices();
    expect(after.map((n: any) => n.title)).toEqual(["Boil water"]);
  });
});
