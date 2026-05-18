import type { Server as HttpServer } from "http";
import { Server as IOServer, Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { verifyAccessToken } from "../services/auth.service";
import { getRedisConnection } from "../config/redis";
import { redisConfigured, isTest } from "../config/env";
import { roleRoom, userRoom } from "./rooms";
import { replaySince } from "./replay";

let io: IOServer | null = null;

const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "https://seproject-six.vercel.app",
];

export interface AuthedSocketData {
  userId: string;
  role: string;
}

const attachAdapter = async (server: IOServer): Promise<void> => {
  if (!redisConfigured()) return;
  try {
    const pub = getRedisConnection().duplicate();
    const sub = getRedisConnection().duplicate();
    server.adapter(createAdapter(pub, sub));
  } catch (err) {
    console.warn(
      "[realtime] Redis adapter unavailable, falling back to in-memory:",
      (err as Error).message
    );
  }
};

/**
 * Stand up the Socket.IO server on the same HTTP server Express is bound to.
 *
 * The handshake is gated on a JWT supplied via `auth.token`. Once a socket is
 * authenticated it auto-joins two rooms:
 *   - `user:{id}`  for personal events (bill paid, booking decision, …)
 *   - `role:{r}`   for role-wide broadcasts (notices, gate alerts, …)
 *
 * If the client passes `auth.lastEventId`, we replay any matching events that
 * landed in the Redis stream while they were disconnected. Missing Redis is
 * not fatal — the server still works, replay is just disabled.
 */
export const initRealtime = async (httpServer: HttpServer): Promise<IOServer> => {
  if (io) return io;

  io = new IOServer(httpServer, {
    cors: {
      origin: ALLOWED_ORIGINS,
      methods: ["GET", "POST"],
      credentials: true,
    },
    // Slightly looser ping in dev/test so flaky network doesn't kill long polls.
    pingInterval: isTest ? 1500 : 25_000,
    pingTimeout: isTest ? 3000 : 20_000,
  });

  await attachAdapter(io);

  io.use((socket, next) => {
    try {
      const raw =
        (socket.handshake.auth?.token as string | undefined) ??
        (typeof socket.handshake.headers.authorization === "string"
          ? socket.handshake.headers.authorization.replace(/^Bearer\s+/i, "")
          : undefined);
      if (!raw) return next(new Error("auth token missing"));
      const payload = verifyAccessToken(raw);
      (socket.data as AuthedSocketData) = {
        userId: String(payload.id),
        role: String(payload.role),
      };
      next();
    } catch (err: any) {
      next(new Error(err?.message || "auth failed"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const { userId, role } = socket.data as AuthedSocketData;
    socket.join(userRoom(userId));
    socket.join(roleRoom(role));

    const lastEventId = socket.handshake.auth?.lastEventId as string | undefined;
    if (lastEventId) {
      const rooms = new Set([userRoom(userId), roleRoom(role)]);
      void replaySince(lastEventId, rooms).then((entries) => {
        for (const e of entries) {
          socket.emit(e.event, { ...((e.data as object | null) ?? {}), _replayId: e.id });
        }
      });
    }

    socket.on("ping:ack", (cb?: (v: string) => void) => {
      if (typeof cb === "function") cb("pong");
    });
  });

  return io;
};

export const getIO = (): IOServer | null => io;

export const closeRealtime = async (): Promise<void> => {
  if (!io) return;
  await io.close();
  io = null;
};
