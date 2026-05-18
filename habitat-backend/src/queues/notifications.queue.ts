import { Queue, Worker, type Job, type WorkerOptions } from "bullmq";
import { getRedisConnection } from "../config/redis";
import { NotificationsJobs, QueueNames, type SendNotificationData } from "./types";
import { sendNotification } from "./notifications.handlers";

let queue: Queue | null = null;
let worker: Worker | null = null;

export const notificationsQueue = (): Queue => {
  if (queue) return queue;
  queue = new Queue(QueueNames.Notifications, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 2_000 },
      removeOnComplete: { count: 500, age: 24 * 60 * 60 },
      removeOnFail: { count: 1000 },
    },
  });
  return queue;
};

/** Enqueue helper used by other services so they don't need to know BullMQ. */
export const enqueueNotification = async (data: SendNotificationData) => {
  return notificationsQueue().add(NotificationsJobs.Send, data);
};

export const startNotificationsWorker = (overrides: Partial<WorkerOptions> = {}): Worker => {
  if (worker) return worker;

  worker = new Worker(
    QueueNames.Notifications,
    async (job: Job) => {
      if (job.name === NotificationsJobs.Send) {
        return sendNotification(job as Job<SendNotificationData>);
      }
      throw new Error(`Unknown notifications job: ${job.name}`);
    },
    { connection: getRedisConnection(), concurrency: 5, ...overrides }
  );

  worker.on("failed", (job, err) => {
    console.error(`[notifications] job ${job?.id} failed:`, err.message);
  });

  return worker;
};

export const closeNotificationsQueue = async (): Promise<void> => {
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (queue) {
    await queue.close();
    queue = null;
  }
};
