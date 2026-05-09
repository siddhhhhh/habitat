import fs from "fs";
import path from "path";
import { MongoMemoryServer } from "mongodb-memory-server";

module.exports = async function globalSetup() {
  const mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri();
  (global as any).__MONGO__ = mongo;
  fs.writeFileSync(path.join(__dirname, ".mongo-uri"), uri);
  process.env.MONGO_URI = uri;
};
