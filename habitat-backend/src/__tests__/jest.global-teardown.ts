import fs from "fs";
import path from "path";
import type { MongoMemoryServer } from "mongodb-memory-server";

module.exports = async function globalTeardown() {
  const mongo = (global as any).__MONGO__ as MongoMemoryServer | undefined;
  if (mongo) await mongo.stop();
  const uriFile = path.join(__dirname, ".mongo-uri");
  if (fs.existsSync(uriFile)) fs.unlinkSync(uriFile);
};
