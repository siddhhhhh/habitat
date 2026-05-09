import "./config/env";
import mongoose from "mongoose";
import { ConnectOptions } from "mongoose";

import { env } from "./config/env";
import { createApp } from "./app";

const app = createApp();

mongoose
  .connect(env.MONGO_URI, {
    tls: true,
    tlsAllowInvalidCertificates: true,
  } as ConnectOptions)
  .then(() => console.log("✅ MongoDB connected successfully"))
  .catch((err) => {
    console.error("❌ Mongo connection error:", err);
    process.exit(1);
  });

app.listen(env.PORT, () => console.log(`Server running on http://localhost:${env.PORT}`));

process.on("SIGINT", async () => {
  console.log("Shutting down...");
  await mongoose.connection.close();
  process.exit(0);
});
