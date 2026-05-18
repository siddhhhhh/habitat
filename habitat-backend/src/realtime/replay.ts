import type { Redis } from "ioredis";
import { getRedisConnection } from "../config/redis";
import { redisConfigured } from "../config/env";

/**
 * Redis-Streams-backed replay buffer for real-time events.
 *
 * Why: when a client briefly disconnects (mobile network blip, tab sleep) it
 * may miss in-flight events. On reconnect the client can pass the last event
 * id it saw and we'll replay anything newer that targets one of its rooms.
 *
 * Stream is capped at ~500 entries (MAXLEN ~) so it stays cheap. If Redis is
 * not configured, every operation is a graceful no-op — the rest of the
 * real-time system still works, you just lose replay on reconnect.
 */

const STREAM_KEY = "habitat:events";
const STREAM_MAXLEN = 500;

export interface ReplayEntry {
  id: string;
  room: string;
  event: string;
  data: unknown;
}

const streamEnabled = (): boolean => redisConfigured();

const client = (): Redis => getRedisConnection();

/** Append an event to the stream. Returns the stream entry id (or null if disabled). */
export const recordEvent = async (
  room: string,
  event: string,
  data: unknown
): Promise<string | null> => {
  if (!streamEnabled()) return null;
  try {
    return await client().xadd(
      STREAM_KEY,
      "MAXLEN",
      "~",
      String(STREAM_MAXLEN),
      "*",
      "room",
      room,
      "event",
      event,
      "data",
      JSON.stringify(data ?? null)
    );
  } catch (err) {
    console.warn("[realtime/replay] xadd failed:", (err as Error).message);
    return null;
  }
};

/**
 * Fetch every event newer than `lastEventId` that targets one of `rooms`.
 * Returns at most `limit` entries to bound the cost of a reconnect.
 */
export const replaySince = async (
  lastEventId: string,
  rooms: Set<string>,
  limit = 100
): Promise<ReplayEntry[]> => {
  if (!streamEnabled() || rooms.size === 0) return [];
  // Stream ids are millisecond-prefixed; "(<id>" is the exclusive form.
  const start = lastEventId && lastEventId !== "0" ? `(${lastEventId}` : "-";
  let raw: [string, string[]][] = [];
  try {
    raw = (await client().xrange(STREAM_KEY, start, "+", "COUNT", limit)) as [
      string,
      string[]
    ][];
  } catch (err) {
    console.warn("[realtime/replay] xrange failed:", (err as Error).message);
    return [];
  }

  const out: ReplayEntry[] = [];
  for (const [id, fields] of raw) {
    const map: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) map[fields[i]] = fields[i + 1];
    if (!rooms.has(map.room)) continue;
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(map.data ?? "null");
    } catch {
      parsed = map.data;
    }
    out.push({ id, room: map.room, event: map.event, data: parsed });
  }
  return out;
};
