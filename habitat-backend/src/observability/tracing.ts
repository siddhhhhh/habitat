import { env, otelConfigured, isTest } from "../config/env";
import { logger } from "../utils/logger";

let sdk: import("@opentelemetry/sdk-node").NodeSDK | null = null;

/**
 * Initialise OpenTelemetry. Only spins up when OTEL_EXPORTER_OTLP_ENDPOINT is
 * set; tests and dev-without-collector pay nothing.
 *
 * The auto-instrumentation set captures express, http, mongoose, ioredis and
 * pino out of the box, so we don't need to scatter manual spans through the
 * codebase. Call this as early as possible — `server.ts` runs it before
 * `createApp()` for that reason.
 */
export const initTracing = async (): Promise<void> => {
  if (sdk || isTest || !otelConfigured()) return;

  // Lazy-require so test environments aren't loading half a gigabyte of
  // OTel modules they will never use.
  const { NodeSDK } = require("@opentelemetry/sdk-node") as typeof import("@opentelemetry/sdk-node");
  const { getNodeAutoInstrumentations } = require("@opentelemetry/auto-instrumentations-node") as typeof import("@opentelemetry/auto-instrumentations-node");
  const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-http") as typeof import("@opentelemetry/exporter-trace-otlp-http");
  const { resourceFromAttributes } = require("@opentelemetry/resources") as typeof import("@opentelemetry/resources");
  const semconv = require("@opentelemetry/semantic-conventions") as typeof import("@opentelemetry/semantic-conventions");

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [semconv.ATTR_SERVICE_NAME]: env.OTEL_SERVICE_NAME,
    }),
    traceExporter: new OTLPTraceExporter({ url: env.OTEL_EXPORTER_OTLP_ENDPOINT }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  try {
    sdk.start();
    logger.info({ endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT }, "[otel] tracing started");
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "[otel] failed to start, continuing without traces");
    sdk = null;
  }
};

export const shutdownTracing = async (): Promise<void> => {
  if (!sdk) return;
  try {
    await sdk.shutdown();
  } catch {
    // ignore — process is exiting anyway
  }
  sdk = null;
};
