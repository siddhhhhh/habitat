import dotenv from "dotenv";

dotenv.config();

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    console.error(`❌ Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
};

const optionalNumber = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (Number.isNaN(n)) {
    console.error(`❌ Environment variable ${name} must be numeric, got: ${raw}`);
    process.exit(1);
  }
  return n;
};

const JWT_SECRET = requireEnv("JWT_SECRET");
if (JWT_SECRET === "changeme" || JWT_SECRET.length < 32) {
  console.error("❌ JWT_SECRET must be at least 32 characters and not the default placeholder.");
  process.exit(1);
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: optionalNumber("PORT", 5000),
  MONGO_URI: requireEnv("MONGO_URI"),
  JWT_SECRET,
  JWT_ACCESS_TTL_SECONDS: optionalNumber("JWT_ACCESS_TTL_SECONDS", 15 * 60),
  JWT_REFRESH_TTL_SECONDS: optionalNumber("JWT_REFRESH_TTL_SECONDS", 30 * 24 * 60 * 60),
  BCRYPT_SALT_ROUNDS: optionalNumber("BCRYPT_SALT_ROUNDS", 10),
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID ?? "",
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET ?? "",
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET ?? "",
  REDIS_URL: process.env.REDIS_URL ?? "",
  ENABLE_WORKERS: (process.env.ENABLE_WORKERS ?? "true").toLowerCase() !== "false",
  LOG_LEVEL: process.env.LOG_LEVEL ?? "info",
  SENTRY_DSN: process.env.SENTRY_DSN ?? "",
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "",
  OTEL_SERVICE_NAME: process.env.OTEL_SERVICE_NAME ?? "habitat-backend",
} as const;

export const razorpayConfigured = () =>
  Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);

export const razorpayWebhookConfigured = () => Boolean(env.RAZORPAY_WEBHOOK_SECRET);

export const redisConfigured = () => Boolean(env.REDIS_URL);

export const sentryConfigured = () => Boolean(env.SENTRY_DSN);

export const otelConfigured = () => Boolean(env.OTEL_EXPORTER_OTLP_ENDPOINT);

export const isProd = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
