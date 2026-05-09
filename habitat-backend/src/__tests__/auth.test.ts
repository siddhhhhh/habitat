import request from "supertest";
import { createApp } from "../app";
import { connectTestDb, disconnectTestDb, clearTestDb } from "./helpers/db";
import RefreshToken from "../models/refreshToken.model";

const app = createApp();

beforeAll(async () => {
  await connectTestDb();
});

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
});

describe("POST /api/auth/register", () => {
  it("creates a user and returns access + refresh tokens", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "Asha",
      email: "asha@test.com",
      password: "password123",
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe("asha@test.com");
    expect(res.body.data.user.password).toBeUndefined();
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(res.body.data.refreshToken).toEqual(expect.any(String));
  });

  it("rejects duplicate emails", async () => {
    await request(app).post("/api/auth/register").send({
      name: "Asha",
      email: "asha@test.com",
      password: "password123",
    });

    const res = await request(app).post("/api/auth/register").send({
      name: "Asha 2",
      email: "asha@test.com",
      password: "password123",
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("rejects short passwords", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "Asha",
      email: "asha@test.com",
      password: "x",
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    await request(app).post("/api/auth/register").send({
      name: "Asha",
      email: "asha@test.com",
      password: "password123",
    });
  });

  it("returns tokens for valid credentials", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: "asha@test.com",
      password: "password123",
    });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(res.body.data.refreshToken).toEqual(expect.any(String));
  });

  it("rejects invalid password", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: "asha@test.com",
      password: "wrongpassword",
    });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("rejects unknown email", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: "nope@test.com",
      password: "password123",
    });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/auth/me", () => {
  it("returns the current user with a valid token", async () => {
    const reg = await request(app).post("/api/auth/register").send({
      name: "Bao",
      email: "bao@test.com",
      password: "password123",
    });
    const token = reg.body.data.token;

    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe("bao@test.com");
  });

  it("rejects when no auth header is sent", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("rejects malformed auth header", async () => {
    const res = await request(app).get("/api/auth/me").set("Authorization", "Token abc");
    expect(res.status).toBe(401);
  });

  it("rejects an obviously bogus token", async () => {
    const res = await request(app).get("/api/auth/me").set("Authorization", "Bearer not.a.jwt");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/refresh", () => {
  const registerAndGetTokens = async () => {
    const reg = await request(app).post("/api/auth/register").send({
      name: "Cleo",
      email: "cleo@test.com",
      password: "password123",
    });
    return reg.body.data as { token: string; refreshToken: string; user: any };
  };

  it("rotates the refresh token and returns a new pair", async () => {
    const { refreshToken } = await registerAndGetTokens();

    const res = await request(app).post("/api/auth/refresh").send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.refreshToken).toEqual(expect.any(String));
    expect(res.body.data.refreshToken).not.toBe(refreshToken);
  });

  it("invalidates the old refresh token after rotation", async () => {
    const { refreshToken } = await registerAndGetTokens();

    await request(app).post("/api/auth/refresh").send({ refreshToken });

    const res = await request(app).post("/api/auth/refresh").send({ refreshToken });
    expect(res.status).toBe(401);
  });

  it("revokes the entire token family on reuse detection", async () => {
    const { refreshToken: r1 } = await registerAndGetTokens();

    const second = await request(app).post("/api/auth/refresh").send({ refreshToken: r1 });
    const r2 = second.body.data.refreshToken as string;

    // Replay r1 — this is reuse, must revoke the family including r2.
    const reuse = await request(app).post("/api/auth/refresh").send({ refreshToken: r1 });
    expect(reuse.status).toBe(401);

    // r2 should now be dead too because the family was revoked.
    const followUp = await request(app).post("/api/auth/refresh").send({ refreshToken: r2 });
    expect(followUp.status).toBe(401);

    const live = await RefreshToken.countDocuments({ revokedAt: { $exists: false } });
    expect(live).toBe(0);
  });

  it("rejects an unknown refresh token", async () => {
    const res = await request(app).post("/api/auth/refresh").send({ refreshToken: "not-a-real-token" });
    expect(res.status).toBe(401);
  });

  it("requires a refreshToken in the body", async () => {
    const res = await request(app).post("/api/auth/refresh").send({});
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/logout", () => {
  it("revokes the presented refresh token", async () => {
    const reg = await request(app).post("/api/auth/register").send({
      name: "Dia",
      email: "dia@test.com",
      password: "password123",
    });
    const refreshToken = reg.body.data.refreshToken;

    const out = await request(app).post("/api/auth/logout").send({ refreshToken });
    expect(out.status).toBe(200);

    const reuse = await request(app).post("/api/auth/refresh").send({ refreshToken });
    expect(reuse.status).toBe(401);
  });

  it("returns 200 even when no token is provided (idempotent)", async () => {
    const res = await request(app).post("/api/auth/logout").send({});
    expect(res.status).toBe(200);
  });
});
