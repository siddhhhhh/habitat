import mongoose from "mongoose";
import { __setStore } from "../../cache";
import { MemoryStore } from "../../cache/memoryStore";

export const connectTestDb = async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGO_URI as string);
  }
};

export const disconnectTestDb = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
};

/**
 * Reset every collection in the test database AND drop the process-local
 * cache. Without the cache reset, a stale list cached by a previous test
 * would survive past the DB wipe and surface phantom rows in the next test.
 */
export const clearTestDb = async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
  __setStore(new MemoryStore());
};
