// End-to-end smoke test against the live backend (no jest, no mocks).
//
// Flow:
//   1. Ensure an admin and a resident exist (register if missing, log in otherwise).
//   2. Resident opens a Socket.IO connection with their JWT.
//   3. Admin POSTs /api/notices.
//   4. Resident's socket must receive `notice.created` with the right title.
//
// Pass: exits 0. Fail: exits 1 with the error.

import { io } from "socket.io-client";

const BASE = process.env.BASE_URL || "http://localhost:5000";
const STAMP = Date.now();
const ADMIN = { email: `smoke-admin-${STAMP}@test.com`, password: "smoke-pass-123" };
const RESIDENT = { email: `smoke-res-${STAMP}@test.com`, password: "smoke-pass-123" };

const fail = (msg) => {
  console.error("FAIL:", msg);
  process.exit(1);
};
const ok = (msg) => console.log("OK:  ", msg);

const post = async (path, body, token) => {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
};

const register = async (user, role) => {
  const r = await post("/api/auth/register", {
    name: `Smoke ${role}`,
    email: user.email,
    password: user.password,
    role,
  });
  if (r.status !== 201 && r.status !== 200) {
    fail(`register ${role} failed: ${r.status} ${JSON.stringify(r.body)}`);
  }
  return r.body.data.token;
};

const main = async () => {
  ok(`Talking to ${BASE}`);

  const adminToken = await register(ADMIN, "admin");
  const residentToken = await register(RESIDENT, "resident");
  ok("Registered admin + resident, got tokens");

  // Open the resident's socket.
  const socket = io(BASE, {
    auth: { token: residentToken },
    transports: ["websocket"],
    reconnection: false,
  });

  const connected = new Promise((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", (err) => reject(err));
    setTimeout(() => reject(new Error("socket connect timeout")), 5000);
  });
  await connected;
  ok(`Resident socket connected (id=${socket.id})`);

  const noticeTitle = `Smoke-${STAMP}`;

  const received = new Promise((resolve, reject) => {
    socket.once("notice.created", (payload) => resolve(payload));
    setTimeout(() => reject(new Error("notice.created not received within 5s")), 5000);
  });

  // Tiny delay so the room-join settles on the server before we publish.
  await new Promise((r) => setTimeout(r, 200));

  const visibleFrom = new Date().toISOString();
  const visibleUntil = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const r = await post(
    "/api/notices",
    {
      title: noticeTitle,
      description: "smoke description",
      visibleFrom,
      visibleUntil,
      audience: ["resident"],
    },
    adminToken
  );
  if (r.status !== 201 && r.status !== 200) {
    fail(`notice POST failed: ${r.status} ${JSON.stringify(r.body)}`);
  }
  ok(`Admin published notice: ${noticeTitle}`);

  const payload = await received;
  if (payload?.title !== noticeTitle) {
    fail(`payload mismatch: ${JSON.stringify(payload)}`);
  }
  ok(`Resident socket got notice.created with matching title`);

  socket.disconnect();
  ok("Smoke passed");
  process.exit(0);
};

main().catch((err) => fail(err?.message || String(err)));
