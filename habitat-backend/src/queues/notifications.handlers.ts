import type { Job } from "bullmq";
import type { SendNotificationData } from "./types";

/**
 * Send a notification.
 *
 * Stub: logs the delivery and pretends success. Wire SMTP / SMS / push providers
 * here later — the queue contract stays the same so producers don't change.
 */
export const sendNotification = async (job: Job<SendNotificationData>) => {
  const { channel, to, subject, body, metadata } = job.data;
  console.log(`[notifications] ${channel} → ${to}`, { subject, body, metadata });
  return { delivered: true, channel, to };
};
