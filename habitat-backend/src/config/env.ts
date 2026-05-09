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
} as const;

export const razorpayConfigured = () =>
  Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);

export const razorpayWebhookConfigured = () => Boolean(env.RAZORPAY_WEBHOOK_SECRET);

export const isProd = env.NODE_ENV === "production";
