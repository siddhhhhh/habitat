import type { Job } from "bullmq";
import BillsModel, { PaymentStatus } from "../models/bills.model";
import User from "../models/user.model";
import { UserRole } from "../utils/enums";
import { BillsService } from "../services/bills.service";
import type {
  GenerateMonthlyBillsData,
  CheckOverdueBillsData,
} from "./types";

const bills = new BillsService();

/** End-of-month date for a YYYY-MM period string. */
const lastDayOfPeriod = (period: string): Date => {
  const [yearStr, monthStr] = period.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  // Day 0 of next month = last day of current month.
  return new Date(Date.UTC(year, month, 0, 23, 59, 59));
};

/**
 * Create a maintenance bill for every active resident for the given period.
 *
 * Idempotency: bulkWrite with upsert on the partial-unique (user, period)
 * index. Running this job twice for the same period is a no-op.
 */
export const generateMonthlyBills = async (job: Job<GenerateMonthlyBillsData>) => {
  const { period, amount, description, dueDateIso } = job.data;

  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw new Error(`Invalid period '${period}', expected YYYY-MM`);
  }
  if (!(amount > 0)) {
    throw new Error("amount must be > 0");
  }

  const dueDate = dueDateIso ? new Date(dueDateIso) : lastDayOfPeriod(period);
  const billDescription = description ?? `Maintenance charge for ${period}`;

  const residents = await User.find({
    role: UserRole.Resident,
    isActive: true,
  }).select("_id");

  if (residents.length === 0) {
    return { created: 0, skipped: 0, residents: 0 };
  }

  const ops = residents.map((u) => ({
    updateOne: {
      filter: { user: u._id, period },
      update: {
        $setOnInsert: {
          user: u._id,
          period,
          description: billDescription,
          amount,
          dueDate,
          status: PaymentStatus.PENDING,
        },
      },
      upsert: true,
    },
  }));

  const result = await BillsModel.bulkWrite(ops, { ordered: false });
  return {
    residents: residents.length,
    created: result.upsertedCount ?? 0,
    skipped: (result.matchedCount ?? 0),
  };
};

/**
 * Flip PENDING bills whose dueDate has passed into OVERDUE. Idempotent — only
 * touches rows still in PENDING. Bills already in PROCESSING / COMPLETED /
 * FAILED / REFUNDED are left alone.
 */
export const checkOverdueBills = async (job: Job<CheckOverdueBillsData>) => {
  const cutoff = job.data.asOfIso ? new Date(job.data.asOfIso) : new Date();
  return bills.markOverdueBefore(cutoff);
};
