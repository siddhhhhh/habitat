/**
 * Names for every queue we run. Keeping them in one place makes it easy to
 * spot typos that would otherwise create a silent second queue.
 */
export const QueueNames = {
  Bills: "bills",
  Webhooks: "webhooks",
  Notifications: "notifications",
} as const;

export type QueueName = (typeof QueueNames)[keyof typeof QueueNames];

// ---- Bills queue ----

export const BillsJobs = {
  GenerateMonthlyBills: "generate-monthly-bills",
  CheckOverdueBills: "check-overdue-bills",
} as const;

export type GenerateMonthlyBillsData = {
  /** YYYY-MM string, e.g. "2026-05" */
  period: string;
  amount: number;
  description?: string;
  /** Optional due-date override (ISO). Defaults to last day of period. */
  dueDateIso?: string;
};

export type CheckOverdueBillsData = {
  /** Override "now" for tests. ISO string. */
  asOfIso?: string;
};

// ---- Webhooks queue ----

export const WebhooksJobs = {
  ProcessRazorpayEvent: "process-razorpay-event",
} as const;

export type ProcessRazorpayEventData = {
  /** Mongo _id of the persisted WebhookEvent document. */
  webhookEventId: string;
};

// ---- Notifications queue ----

export const NotificationsJobs = {
  Send: "send-notification",
} as const;

export type SendNotificationData = {
  channel: "email" | "sms" | "push" | "log";
  to: string;
  subject?: string;
  body: string;
  metadata?: Record<string, unknown>;
};
