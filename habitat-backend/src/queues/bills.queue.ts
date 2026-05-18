import { Queue, Worker, type Job, type WorkerOptions } from "bullmq";
import { getRedisConnection } from "../config/redis";
import { BillsJobs, QueueNames, type GenerateMonthlyBillsData, type CheckOverdueBillsData } from "./types";
import { generateMonthlyBills, checkOverdueBills } from "./bills.handlers";

let queue: Queue | null = null;
let worker: Worker | null = null;

/**
 * Lazy queue accessor. Creates the BullMQ Queue on first call so importing
 * this module doesn't open a Redis connection at boot.
 */
export const billsQueue = (): Queue => {
  if (queue) return queue;
  queue = new Queue(QueueNames.Bills, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { count: 100, age: 24 * 60 * 60 },
      removeOnFail: { count: 500 },
    },
  });
  return queue;
};

/**
 * Start the bills worker. Idempotent — safe to call multiple times.
 */
export const startBillsWorker = (overrides: Partial<WorkerOptions> = {}): Worker => {
  if (worker) return worker;

  worker = new Worker(
    QueueNames.Bills,
    async (job: Job) => {
      switch (job.name) {
        case BillsJobs.GenerateMonthlyBills:
          return generateMonthlyBills(job as Job<GenerateMonthlyBillsData>);
        case BillsJobs.CheckOverdueBills:
          return checkOverdueBills(job as Job<CheckOverdueBillsData>);
        default:
          throw new Error(`Unknown bills job: ${job.name}`);
      }
    },
    { connection: getRedisConnection(), concurrency: 2, ...overrides }
  );

  worker.on("failed", (job, err) => {
    console.error(`[bills] job ${job?.id} (${job?.name}) failed:`, err.message);
  });
  worker.on("completed", (job, result) => {
    console.log(`[bills] job ${job.id} (${job.name}) completed`, result);
  });

  return worker;
};

/**
 * Register recurring schedules. Runs at boot when the worker is enabled.
 *  - Monthly bill generation: 02:00 UTC on day 1
 *  - Overdue scan: 03:00 UTC daily
 */
export const scheduleBillsRecurring = async (params: {
  monthlyAmount: number;
}): Promise<void> => {
  const q = billsQueue();

  // Monthly: figure out which period the *next* run will create.
  // Cron runs on day 1 — bill the period that just ended (previous month).
  // For demos and tests we can also enqueue a one-off for the current period.
  await q.add(
    BillsJobs.GenerateMonthlyBills,
    {
      period: previousPeriod(new Date()),
      amount: params.monthlyAmount,
    },
    {
      repeat: { pattern: "0 2 1 * *", tz: "UTC" },
      jobId: "monthly-bill-generator",
    }
  );

  await q.add(
    BillsJobs.CheckOverdueBills,
    {},
    {
      repeat: { pattern: "0 3 * * *", tz: "UTC" },
      jobId: "daily-overdue-scanner",
    }
  );
};

/** YYYY-MM for the month before `d`. */
export const previousPeriod = (d: Date): string => {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
};

export const closeBillsQueue = async (): Promise<void> => {
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (queue) {
    await queue.close();
    queue = null;
  }
};
