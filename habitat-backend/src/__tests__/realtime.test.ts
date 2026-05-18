import http from "http";
import type { AddressInfo } from "net";
import { io as ioClient, Socket as ClientSocket } from "socket.io-client";

import { createApp } from "../app";
import { initRealtime, closeRealtime, getIO } from "../realtime";
import { emitToRole, emitToUser, RealtimeEvents } from "../realtime/events";
import { roleRoom, userRoom } from "../realtime/rooms";
import { UserRole } from "../utils/enums";
import { connectTestDb, disconnectTestDb, clearTestDb } from "./helpers/db";
import { createUser } from "./helpers/factories";

/**
 * Real-time tests stand up the full Socket.IO server on an ephemeral port and
 * exercise it with the official socket.io-client. We assert:
 *   - Unauthenticated handshakes are rejected.
 *   - Authenticated sockets auto-join their role and user rooms.
 *   - Targeted emits hit only the intended rooms.
 *
 * Redis-backed replay is tested separately in the replay unit suite.
 */

let httpServer: http.Server;
let port: number;

const baseUrl = () => `http://127.0.0.1:${port}`;

const connect = (auth: Record<string, unknown>) =>
  new Promise<ClientSocket>((resolve, reject) => {
    const sock = ioClient(baseUrl(), {
      auth,
      transports: ["websocket"],
      reconnection: false,
      forceNew: true,
      timeout: 4000,
    });
    sock.once("connect", () => resolve(sock));
    sock.once("connect_error", (err) => reject(err));
  });

const waitFor = <T = unknown>(sock: ClientSocket, event: string, ms = 1500) =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), ms);
    sock.once(event, (data: T) => {
      clearTimeout(t);
      resolve(data);
    });
  });

beforeAll(async () => {
  await connectTestDb();
  const app = createApp();
  httpServer = http.createServer(app);
  await initRealtime(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  port = (httpServer.address() as AddressInfo).port;
});

afterAll(async () => {
  // io.close() tears down the underlying HTTP server as well, so we don't
  // double-close it (calling httpServer.close() afterwards errors with
  // "Server is not running.").
  await closeRealtime();
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
});

describe("socket handshake auth", () => {
  it("rejects connections with no token", async () => {
    await expect(connect({})).rejects.toThrow(/auth token missing/);
  });

  it("rejects connections with a bogus token", async () => {
    await expect(connect({ token: "not-a-jwt" })).rejects.toThrow();
  });

  it("accepts a valid JWT and auto-joins role + user rooms", async () => {
    const { accessToken, user } = await createUser({ role: UserRole.Resident });

    const sock = await connect({ token: accessToken });
    // socket.id is set after connect; ask the server which rooms it's in.
    const serverSocket = (await new Promise<any>((resolve) => {
      const ioSrv = getIO()!;
      ioSrv.fetchSockets().then((sockets) => resolve(sockets.find((s) => s.id === sock.id)));
    }));

    expect(serverSocket).toBeTruthy();
    expect(Array.from(serverSocket.rooms)).toEqual(
      expect.arrayContaining([userRoom(String(user._id)), roleRoom(UserRole.Resident)])
    );

    sock.disconnect();
  });
});

describe("targeted emits", () => {
  it("delivers a notice broadcast to a resident", async () => {
    const { accessToken } = await createUser({ role: UserRole.Resident });

    const sock = await connect({ token: accessToken });
    const received = waitFor<{ title: string }>(sock, RealtimeEvents.NoticeCreated);

    await emitToRole(UserRole.Resident, RealtimeEvents.NoticeCreated, {
      title: "Water shut-off",
    });

    await expect(received).resolves.toMatchObject({ title: "Water shut-off" });
    sock.disconnect();
  });

  it("does not deliver a role-targeted event to other roles", async () => {
    const resident = await createUser({ role: UserRole.Resident, email: "r@test.com" });
    const security = await createUser({ role: UserRole.Security, email: "s@test.com" });

    const securitySock = await connect({ token: security.accessToken });
    const residentSock = await connect({ token: resident.accessToken });

    let residentGot = false;
    residentSock.on(RealtimeEvents.VisitorAlert, () => {
      residentGot = true;
    });
    const securityHeard = waitFor(securitySock, RealtimeEvents.VisitorAlert);

    await emitToRole(UserRole.Security, RealtimeEvents.VisitorAlert, { gate: "main" });

    await expect(securityHeard).resolves.toMatchObject({ gate: "main" });
    // Give the resident a moment to receive (or not).
    await new Promise((r) => setTimeout(r, 100));
    expect(residentGot).toBe(false);

    residentSock.disconnect();
    securitySock.disconnect();
  });

  it("delivers a per-user event only to that user's socket", async () => {
    const a = await createUser({ role: UserRole.Resident, email: "a@test.com" });
    const b = await createUser({ role: UserRole.Resident, email: "b@test.com" });

    const sockA = await connect({ token: a.accessToken });
    const sockB = await connect({ token: b.accessToken });

    let bGot = false;
    sockB.on(RealtimeEvents.BillPaid, () => {
      bGot = true;
    });
    const aHeard = waitFor(sockA, RealtimeEvents.BillPaid);

    await emitToUser(String(a.user._id), RealtimeEvents.BillPaid, { billId: "abc" });

    await expect(aHeard).resolves.toMatchObject({ billId: "abc" });
    await new Promise((r) => setTimeout(r, 100));
    expect(bGot).toBe(false);

    sockA.disconnect();
    sockB.disconnect();
  });
});
