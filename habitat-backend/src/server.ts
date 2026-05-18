import "./config/env";
import { initTracing, shutdownTracing } from "./observability/tracing";
import { initSentry } from "./observability/sentry";
// OTel must be initialised before any module that emits spans is required.
// initSentry must run before express is required too. They're synchronous-ish
// and no-op when their env vars are unset.
initSentry();
void initTracing();

import http from "http";
import mongoose from "mongoose";
import { ConnectOptions } from "mongoose";

import { env } from "./config/env";
import { createApp } from "./app";
import { startWorkers, stopWorkers } from "./queues";
import { initRealtime, closeRealtime } from "./realtime";
import { logger } from "./utils/logger";

const app = createApp();

const start = async () => {
  await mongoose.connect(env.MONGO_URI, {
    tls: true,
    tlsAllowInvalidCertificates: true,
  } as ConnectOptions);
  logger.info("MongoDB connected");

  try {
    await startWorkers();
  } catch (err) {
    logger.error({ err }, "Worker startup failed (continuing without queues)");
  }

  const server = http.createServer(app);
  await initRealtime(server);

  server.listen(env.PORT, () =>
    logger.info({ port: env.PORT }, "Server running (HTTP + Socket.IO)")
  );

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down");
    server.close(() => logger.info("HTTP server closed"));
    try {
      await closeRealtime();
    } catch (err) {
      logger.error({ err }, "Error closing realtime");
    }
    try {
      await stopWorkers();
    } catch (err) {
      logger.error({ err }, "Error stopping workers");
    }
    try {
      await mongoose.connection.close();
    } catch (err) {
      logger.error({ err }, "Error closing Mongo");
    }
    try {
      await shutdownTracing();
    } catch (err) {
      logger.error({ err }, "Error shutting down tracing");
    }
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
};

start().catch((err) => {
  logger.fatal({ err }, "Server failed to start");
  process.exit(1);
});
