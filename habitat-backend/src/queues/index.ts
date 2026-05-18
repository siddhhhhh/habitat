import { env, redisConfigured, isTest } from "../config/env";
import { closeRedisConnection } from "../config/redis";
import {
  startBillsWorker,
  scheduleBillsRecurring,
  closeBillsQueue,
} from "./bills.queue";
import {
  startNotificationsWorker,
  closeNotificationsQueue,
} from "./notifications.queue";
import { startWebhooksWorker, closeWebhooksQueue } from "./webhooks.queue";

let started = false;

/**
 * Start every BullMQ worker the app owns and register recurring schedules.
 *
 * Returns silently when:
 *   - Redis is not configured (graceful degradation in dev/portfolio mode)
 *   - ENABLE_WORKERS=false (e.g. CI, or running the API as a thin proxy
 *     while a separate worker process handles jobs)
 *   - NODE_ENV=test (tests opt in to specific workers when they need them)
 */
export const startWorkers = async (): Promise<void> => {
  if (started) return;
  if (isTest) return;
  if (!redisConfigured()) {
    console.warn("[queues] REDIS_URL not set — workers disabled (inline fallback only)");
    return;
  }
  if (!env.ENABLE_WORKERS) {
    console.log("[queues] ENABLE_WORKERS=false — workers disabled");
    return;
  }

  startBillsWorker();
  startNotificationsWorker();
  startWebhooksWorker();

  // Read the recurring schedule's monthly amount from env. Default sensible
  // value for the demo; real societies would manage this per-flat.
  const monthlyAmount = Number(process.env.MONTHLY_MAINTENANCE_AMOUNT ?? 5000);
  await scheduleBillsRecurring({ monthlyAmount });

  started = true;
  console.log("✅ BullMQ workers started (bills, notifications, webhooks)");
};

/**
 * Close every worker and queue cleanly. Called from the server's SIGTERM/SIGINT
 * handlers so in-flight jobs finish or rescheduled rather than being killed.
 */
export const stopWorkers = async (): Promise<void> => {
  if (!started) return;
  await Promise.allSettled([
    closeBillsQueue(),
    closeNotificationsQueue(),
    closeWebhooksQueue(),
  ]);
  await closeRedisConnection();
  started = false;
};
