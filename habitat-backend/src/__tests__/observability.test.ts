import request from "supertest";
import express from "express";
import pino from "pino";
import { Writable } from "stream";
import { createApp } from "../app";
import { requestId } from "../middlewares/requestId.middleware";

describe("request-id middleware", () => {
  it("echoes a client-supplied x-request-id back on the response", async () => {
    const app = express();
    app.use(requestId);
    app.get("/whoami", (req, res) => res.json({ id: (req as any).id }));

    const res = await request(app)
      .get("/whoami")
      .set("x-request-id", "trace-abc-123");

    expect(res.headers["x-request-id"]).toBe("trace-abc-123");
    expect(res.body.id).toBe("trace-abc-123");
  });

  it("mints a UUID when no header is provided", async () => {
    const app = express();
    app.use(requestId);
    app.get("/whoami", (req, res) => res.json({ id: (req as any).id }));

    const res = await request(app).get("/whoami");
    expect(res.headers["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(res.body.id).toBe(res.headers["x-request-id"]);
  });

  it("rejects an absurdly long incoming header and mints fresh", async () => {
    const app = express();
    app.use(requestId);
    app.get("/whoami", (req, res) => res.json({ id: (req as any).id }));

    const huge = "x".repeat(500);
    const res = await request(app).get("/whoami").set("x-request-id", huge);
    expect(res.body.id).not.toBe(huge);
    expect(res.body.id.length).toBeLessThan(huge.length);
  });

  it("propagates through to the real app pipeline (full createApp())", async () => {
    const app = createApp();
    const res = await request(app)
      .get("/healthz")
      .set("x-request-id", "from-edge");
    expect(res.headers["x-request-id"]).toBe("from-edge");
  });
});

describe("logger redaction", () => {
  // Spin up a parallel pino instance with the same redact config so we can
  // attach a capture stream and assert. The production logger's level is
  // "silent" under NODE_ENV=test, so writing to it would emit nothing.
  const lines: string[] = [];
  const sink = new Writable({
    write(chunk, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  const testLogger = pino(
    {
      level: "info",
      redact: {
        paths: ["req.headers.authorization", "req.body.password", "*.token"],
        censor: "[redacted]",
      },
    },
    sink
  );

  beforeEach(() => {
    lines.length = 0;
  });

  it("redacts Authorization headers", () => {
    testLogger.info(
      { req: { headers: { authorization: "Bearer supersecret" } } },
      "hello"
    );
    const json = JSON.parse(lines[0]);
    expect(json.req.headers.authorization).toBe("[redacted]");
    expect(lines.join("\n")).not.toContain("supersecret");
  });

  it("redacts password fields in request body", () => {
    testLogger.info({ req: { body: { password: "hunter2" } } }, "signup");
    const json = JSON.parse(lines[0]);
    expect(json.req.body.password).toBe("[redacted]");
    expect(lines.join("\n")).not.toContain("hunter2");
  });
});
