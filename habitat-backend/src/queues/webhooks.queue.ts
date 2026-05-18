import { Queue, Worker, type Job, type WorkerOptions } from "bullmq";
import { getRedisConnection } from "../config/redis";
import { QueueNames, WebhooksJobs, type ProcessRazorpayEventData } from "./types";
import { processRazorpayEvent } from "./webhooks.handlers";

let queue: Queue | null = null;
let worker: Worker | null = null;

export const webhooksQueue = (): Queue => {
  if (queue) return queue;
  queue = new Queue(QueueNames.Webhooks, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnComplete: { count: 200, age: 7 * 24 * 60 * 60 },
      removeOnFail: { count: 1000 },
    },
  });
  return queue;
};

export const enqueueRazorpayEvent = async (data: ProcessRazorpayEventData) => {
  return webhooksQueue().add(WebhooksJobs.ProcessRazorpayEvent, data, {
    // jobId set to the WebhookEvent id makes the queue itself idempotent —
    // a duplicate enqueue (e.g. controller retried) becomes a no-op.
    jobId: data.webhookEventId,
  });
};

export const startWebhooksWorker = (overrides: Partial<WorkerOptions> = {}): Worker => {
  if (worker) return worker;

  worker = new Worker(
    QueueNames.Webhooks,
    async (job: Job) => {
      if (job.name === WebhooksJobs.ProcessRazorpayEvent) {
        return processRazorpayEvent(job as Job<ProcessRazorpayEventData>);
      }
      throw new Error(`Unknown webhooks job: ${job.name}`);
    },
    { connection: getRedisConnection(), concurrency: 4, ...overrides }
  );

  worker.on("failed", (job, err) => {
    console.error(`[webhooks] job ${job?.id} failed:`, err.message);
  });

  return worker;
};

export const closeWebhooksQueue = async (): Promise<void> => {
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (queue) {
    await queue.close();
    queue = null;
  }
};
