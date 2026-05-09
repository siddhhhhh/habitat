import request from "supertest";
import { createApp } from "../app";
import { connectTestDb, disconnectTestDb, clearTestDb } from "./helpers/db";
import { createUser, authHeader } from "./helpers/factories";
import { UserRole } from "../utils/enums";

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

describe("Bills route lockdown", () => {
  it("requires authentication on GET /api/bills", async () => {
    const res = await request(app).get("/api/bills");
    expect(res.status).toBe(401);
  });

  it("denies bill creation to a resident", async () => {
    const { accessToken } = await createUser({ role: UserRole.Resident });
    const res = await request(app)
      .post("/api/bills")
      .set(authHeader(accessToken))
      .send({ user: "000000000000000000000000", description: "x", amount: 10, dueDate: new Date().toISOString() });
    expect(res.status).toBe(403);
  });

  it("denies bill deletion to a committee member (admin only)", async () => {
    const { accessToken } = await createUser({ role: UserRole.Committee });
    const res = await request(app)
      .delete("/api/bills/000000000000000000000000")
      .set(authHeader(accessToken));
    expect(res.status).toBe(403);
  });

  it("allows committee to GET bills", async () => {
    const { accessToken } = await createUser({ role: UserRole.Committee });
    const res = await request(app).get("/api/bills").set(authHeader(accessToken));
    expect(res.status).toBe(200);
  });
});

describe("Amenities route lockdown", () => {
  it("requires auth on read", async () => {
    const res = await request(app).get("/api/amenities");
    expect(res.status).toBe(401);
  });

  it("allows residents to read", async () => {
    const { accessToken } = await createUser({ role: UserRole.Resident });
    const res = await request(app).get("/api/amenities").set(authHeader(accessToken));
    expect(res.status).toBe(200);
  });

  it("denies amenity create to residents", async () => {
    const { accessToken } = await createUser({ role: UserRole.Resident });
    const res = await request(app)
      .post("/api/amenities")
      .set(authHeader(accessToken))
      .send({ name: "Pool" });
    expect(res.status).toBe(403);
  });

  it("allows committee to create amenities", async () => {
    const { accessToken } = await createUser({ role: UserRole.Committee });
    const res = await request(app)
      .post("/api/amenities")
      .set(authHeader(accessToken))
      .send({ name: "Pool" });
    expect([200, 201]).toContain(res.status);
  });
});

describe("Technicians route lockdown", () => {
  it("requires auth", async () => {
    const res = await request(app).get("/api/technicians");
    expect(res.status).toBe(401);
  });

  it("denies create to residents", async () => {
    const { accessToken } = await createUser({ role: UserRole.Resident });
    const res = await request(app)
      .post("/api/technicians")
      .set(authHeader(accessToken))
      .send({ name: "Ravi", specializations: ["plumbing"] });
    expect(res.status).toBe(403);
  });

  it("allows admin to create", async () => {
    const { accessToken } = await createUser({ role: UserRole.Admin });
    const res = await request(app)
      .post("/api/technicians")
      .set(authHeader(accessToken))
      .send({ name: "Ravi", specializations: ["plumbing"] });
    expect([200, 201]).toContain(res.status);
  });
});

describe("Visitors route lockdown", () => {
  it("requires auth", async () => {
    const res = await request(app).get("/api/visitors");
    expect(res.status).toBe(401);
  });

  it("denies residents from reading the gate log", async () => {
    const { accessToken } = await createUser({ role: UserRole.Resident });
    const res = await request(app).get("/api/visitors").set(authHeader(accessToken));
    expect(res.status).toBe(403);
  });

  it("allows security to read the gate log", async () => {
    const { accessToken } = await createUser({ role: UserRole.Security });
    const res = await request(app).get("/api/visitors").set(authHeader(accessToken));
    expect(res.status).toBe(200);
  });

  it("denies security from deleting (admin/committee only)", async () => {
    const { accessToken } = await createUser({ role: UserRole.Security });
    const res = await request(app)
      .delete("/api/visitors/000000000000000000000000")
      .set(authHeader(accessToken));
    expect(res.status).toBe(403);
  });
});

describe("Disabled accounts", () => {
  it("blocks an inactive user from authenticating with a previously-issued token", async () => {
    const { accessToken, user } = await createUser({ role: UserRole.Admin });
    user.isActive = false;
    await user.save();

    const res = await request(app).get("/api/auth/me").set(authHeader(accessToken));
    expect(res.status).toBe(401);
  });
});
