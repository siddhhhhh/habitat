import type { Application, ErrorRequestHandler } from "express";
import { env, sentryConfigured, isTest } from "../config/env";
import { logger } from "../utils/logger";

let initialised = false;
let SentryMod: typeof import("@sentry/node") | null = null;

/**
 * Initialise Sentry if SENTRY_DSN is set. Lazy-imports the SDK so unit tests
 * that never set the DSN don't pay for the require graph.
 */
export const initSentry = (): void => {
  if (initialised || isTest || !sentryConfigured()) return;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  SentryMod = require("@sentry/node") as typeof import("@sentry/node");
  SentryMod.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: 0.05,
  });
  initialised = true;
  logger.info("[sentry] initialised");
};

/**
 * Express error handler that funnels exceptions through Sentry (if configured)
 * before re-throwing so the existing `errorHandler` still produces a response.
 * Mount BEFORE `errorHandler`.
 */
export const sentryErrorHandler: ErrorRequestHandler = (err, _req, _res, next) => {
  if (initialised && SentryMod) {
    SentryMod.captureException(err);
  }
  next(err);
};

/**
 * Hook the request-handler before mounting any routes. No-op if Sentry isn't
 * initialised. Keeps the API quiet from a caller's perspective — they can
 * always call this; it just doesn't do anything until DSN is set.
 */
export const attachSentryRequestHandlers = (_app: Application): void => {
  if (!initialised || !SentryMod) return;
  // Modern @sentry/node v8+ relies on OTel-based auto-tracing; no legacy
  // Handlers.requestHandler / tracingHandler middleware needed.
  // We capture errors via sentryErrorHandler above.
};
