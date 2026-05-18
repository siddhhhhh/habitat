import pino, { Logger } from "pino";
import { env, isProd, isTest } from "../config/env";

/**
 * Single base logger for the whole backend. Use `logger.child({ requestId })`
 * for request-scoped fields — the middleware does that for you and stashes
 * the child on `req.log` (see middlewares/requestId.middleware.ts).
 *
 * Redaction: anything that looks like a secret never reaches stdout. Add new
 * paths here when introducing new sensitive fields rather than scrubbing at
 * the call site, so we can't accidentally leak from a logger we forgot about.
 */

const transport = !isProd && !isTest
  ? {
      target: "pino/file",
      options: { destination: 1, ignore: "pid,hostname" },
    }
  : undefined;

export const logger: Logger = pino({
  level: isTest ? "silent" : env.LOG_LEVEL,
  base: { service: "habitat-backend" },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.body.password",
      "req.body.token",
      "req.body.refreshToken",
      "*.password",
      "*.token",
      "*.refreshToken",
      "*.jwt",
    ],
    censor: "[redacted]",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  transport,
});

export const childLogger = (bindings: Record<string, unknown>): Logger =>
  logger.child(bindings);
