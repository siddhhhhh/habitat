import fs from "fs";
import path from "path";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-must-be-at-least-32-chars-aaaaaaaa";
process.env.JWT_ACCESS_TTL_SECONDS = "900";
process.env.JWT_REFRESH_TTL_SECONDS = "2592000";
process.env.BCRYPT_SALT_ROUNDS = "4";
process.env.RAZORPAY_WEBHOOK_SECRET = "test-webhook-secret";
// Leave RAZORPAY_KEY_ID / SECRET unset by default so tests can verify the
// "not configured" path; specific tests can set them inline.

const uriFile = path.join(__dirname, ".mongo-uri");
if (fs.existsSync(uriFile)) {
  process.env.MONGO_URI = fs.readFileSync(uriFile, "utf8").trim();
} else {
  process.env.MONGO_URI = "mongodb://placeholder:27017/habitat-test";
}
