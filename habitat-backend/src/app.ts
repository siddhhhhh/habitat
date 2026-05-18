import "./config/env";
import express, { Application } from "express";
import cors from "cors";
import helmet from "helmet";
import mongoSanitize from "express-mongo-sanitize";
import pinoHttp from "pino-http";
import mongoose from "mongoose";

import { isTest } from "./config/env";
import { logger } from "./utils/logger";
import { requestId } from "./middlewares/requestId.middleware";
import { sentryErrorHandler, attachSentryRequestHandlers } from "./observability/sentry";

import "./models/user.model";
import "./models/amenities.model";
import "./models/bookings.model";
import "./models/bills.model";
import "./models/issues.model";
import "./models/technicians.model";
import "./models/visitors.model";
import "./models/notice.model";
import "./models/refreshToken.model";
import "./models/webhookEvent.model";

import authRoutes from "./routes/auth.routes";
import usersRoutes from "./routes/users.routes";
import noticeRoutes from "./routes/notices.routes";
import amenitiesRoutes from "./routes/amenities.routes";
import billsRoutes from "./routes/bills.routes";
import bookingsRoutes from "./routes/bookings.routes";
import issuesRoutes from "./routes/issues.routes";
import techniciansRoutes from "./routes/technicians.routes";
import visitorsRoutes from "./routes/visitors.routes";
import webhooksRoutes from "./routes/webhooks.routes";

import { errorHandler } from "./middlewares/error.middleware";

export function createApp(): Application {
  const app: Application = express();

  app.set("trust proxy", 1);

  attachSentryRequestHandlers(app);

  app.use(requestId);
  if (!isTest) {
    app.use(
      pinoHttp({
        logger,
        genReqId: (req) => (req as any).id,
        customSuccessMessage: (req, res) =>
          `${req.method} ${req.url} ${res.statusCode}`,
        customErrorMessage: (req, res) =>
          `${req.method} ${req.url} ${res.statusCode}`,
      })
    );
  }

  app.use(helmet());

  app.use(
    cors({
      origin: ["http://localhost:3000", "https://seproject-six.vercel.app"],
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "Cache-Control", "Pragma", "Expires"],
      credentials: true,
    })
  );

  app.use(
    express.json({
      limit: "100kb",
      verify: (req: any, _res, buf) => {
        // Stash raw bytes so webhook handlers can verify HMAC signatures.
        req.rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: true, limit: "100kb" }));
  app.use(mongoSanitize());

  app.get("/", (_req, res) => res.send("Habitat backend running"));
  app.get("/healthz", (_req, res) => res.json({ status: "ok" }));
  app.get("/readyz", (_req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not-ready" });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/users", usersRoutes);
  app.use("/api/notices", noticeRoutes);
  app.use("/api/amenities", amenitiesRoutes);
  app.use("/api/bills", billsRoutes);
  app.use("/api/bookings", bookingsRoutes);
  app.use("/api/issues", issuesRoutes);
  app.use("/api/technicians", techniciansRoutes);
  app.use("/api/visitors", visitorsRoutes);
  app.use("/api/webhooks", webhooksRoutes);

  app.use(sentryErrorHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
