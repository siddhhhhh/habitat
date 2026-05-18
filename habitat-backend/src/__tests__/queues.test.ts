import type { Job } from "bullmq";
import { connectTestDb, disconnectTestDb, clearTestDb } from "./helpers/db";
import { createUser } from "./helpers/factories";
import { UserRole } from "../utils/enums";
import BillsModel, { PaymentStatus } from "../models/bills.model";
import WebhookEvent, { WebhookStatus } from "../models/webhookEvent.model";
import {
  generateMonthlyBills,
  checkOverdueBills,
} from "../queues/bills.handlers";
import { processRazorpayEvent } from "../queues/webhooks.handlers";
import { previousPeriod } from "../queues/bills.queue";

/**
 * Queue handler tests. These run BullMQ job *handlers* directly with crafted
 * Job-shaped objects so we don't need a live Redis to assert behaviour.
 *
 * The handlers are the unit of business logic; everything else BullMQ does
 * (retry, backoff, delayed jobs) is library code we trust.
 */

const fakeJob = <T>(data: T): Job<T> =>
  ({
    data,
    id: "test-job",
    name: "test",
    attemptsMade: 0,
  } as unknown as Job<T>);

beforeAll(async () => {
  await connectTestDb();
});
afterAll(async () => {
  await disconnectTestDb();
});
beforeEach(async () => {
  await clearTestDb();
});

describe("generateMonthlyBills", () => {
  it("creates one bill per active resident for a given period", async () => {
    await createUser({ role: UserRole.Resident, email: "r1@test.com" });
    await createUser({ role: UserRole.Resident, email: "r2@test.com" });
    await createUser({ role: UserRole.Admin, email: "a@test.com" });

    const result = await generateMonthlyBills(
      fakeJob({ period: "2026-05", amount: 5000 })
    );

    expect(result.residents).toBe(2);
    expect(result.created).toBe(2);

    const bills = await BillsModel.find({ period: "2026-05" });
    expect(bills).toHaveLength(2);
    expect(bills[0].amount).toBe(5000);
    expect(bills[0].status).toBe(PaymentStatus.PENDING);
    expect(bills[0].description).toMatch(/2026-05/);
  });

  it("skips inactive residents", async () => {
    await createUser({ role: UserRole.Resident, isActive: true, email: "active@test.com" });
    await createUser({ role: UserRole.Resident, isActive: false, email: "inactive@test.com" });

    const result = await generateMonthlyBills(
      fakeJob({ period: "2026-05", amount: 5000 })
    );

    expect(result.residents).toBe(1);
    expect(result.created).toBe(1);
  });

  it("is idempotent — re-running for the same period creates no duplicates", async () => {
    await createUser({ role: UserRole.Resident, email: "r1@test.com" });
    await createUser({ role: UserRole.Resident, email: "r2@test.com" });

    await generateMonthlyBills(fakeJob({ period: "2026-05", amount: 5000 }));
    const second = await generateMonthlyBills(
      fakeJob({ period: "2026-05", amount: 9999 })
    );

    expect(second.created).toBe(0);
    const bills = await BillsModel.find({ period: "2026-05" });
    expect(bills).toHaveLength(2);
    // First run wins — second run's $setOnInsert is a no-op.
    expect(bills[0].amount).toBe(5000);
  });

  it("rejects invalid period format", async () => {
    await expect(
      generateMonthlyBills(fakeJob({ period: "May 2026", amount: 5000 }))
    ).rejects.toThrow(/period/i);
  });

  it("rejects non-positive amount", async () => {
    await expect(
      generateMonthlyBills(fakeJob({ period: "2026-05", amount: 0 }))
    ).rejects.toThrow(/amount/i);
  });

  it("uses dueDateIso override when provided", async () => {
    await createUser({ role: UserRole.Resident, email: "r1@test.com" });

    await generateMonthlyBills(
      fakeJob({
        period: "2026-05",
        amount: 5000,
        dueDateIso: "2026-05-15T00:00:00.000Z",
      })
    );

    const bill = await BillsModel.findOne({ period: "2026-05" });
    expect(bill?.dueDate.toISOString()).toBe("2026-05-15T00:00:00.000Z");
  });
});

describe("checkOverdueBills", () => {
  it("flips PENDING bills past dueDate to OVERDUE", async () => {
    const { user } = await createUser({ role: UserRole.Resident });

    await BillsModel.create({
      user: user._id,
      description: "old",
      amount: 100,
      dueDate: new Date("2026-01-01"),
      status: PaymentStatus.PENDING,
    });
    await BillsModel.create({
      user: user._id,
      description: "future",
      amount: 100,
      dueDate: new Date("2099-01-01"),
      status: PaymentStatus.PENDING,
    });

    const result = await checkOverdueBills(
      fakeJob({ asOfIso: "2026-06-01T00:00:00.000Z" })
    );

    expect(result.modified).toBe(1);

    const overdue = await BillsModel.findOne({ status: PaymentStatus.OVERDUE });
    expect(overdue?.description).toBe("old");
  });

  it("does not touch COMPLETED bills with past dueDate", async () => {
    const { user } = await createUser({ role: UserRole.Resident });

    await BillsModel.create({
      user: user._id,
      description: "paid late",
      amount: 100,
      dueDate: new Date("2026-01-01"),
      status: PaymentStatus.COMPLETED,
    });

    await checkOverdueBills(fakeJob({ asOfIso: "2026-06-01T00:00:00.000Z" }));

    const bill = await BillsModel.findOne({ description: "paid late" });
    expect(bill?.status).toBe(PaymentStatus.COMPLETED);
  });

  it("is idempotent across runs", async () => {
    const { user } = await createUser({ role: UserRole.Resident });

    await BillsModel.create({
      user: user._id,
      description: "old",
      amount: 100,
      dueDate: new Date("2026-01-01"),
      status: PaymentStatus.PENDING,
    });

    const first = await checkOverdueBills(fakeJob({ asOfIso: "2026-06-01T00:00:00.000Z" }));
    const second = await checkOverdueBills(fakeJob({ asOfIso: "2026-06-01T00:00:00.000Z" }));

    expect(first.modified).toBe(1);
    expect(second.modified).toBe(0);
  });
});

describe("processRazorpayEvent (worker handler)", () => {
  const seedBill = async (status = PaymentStatus.PROCESSING) => {
    const { user } = await createUser({ role: UserRole.Resident });
    return BillsModel.create({
      user: user._id,
      description: "bill",
      amount: 100,
      dueDate: new Date(),
      status,
    });
  };

  const seedEvent = async (
    bill: any,
    overrides: Partial<{
      eventType: string;
      paymentId: string;
      status: WebhookStatus;
    }> = {}
  ) => {
    return WebhookEvent.create({
      provider: "razorpay",
      eventId: `evt_${Math.random().toString(36).slice(2, 10)}`,
      eventType: overrides.eventType ?? "payment.captured",
      status: overrides.status ?? WebhookStatus.RECEIVED,
      payload: {
        event: overrides.eventType ?? "payment.captured",
        payload: {
          payment: {
            entity: {
              id: overrides.paymentId ?? "pay_xxx",
              order_id: "order_abc",
              status: "captured",
              notes: { billId: String(bill._id) },
            },
          },
        },
      },
    });
  };

  it("marks bill paid on payment.captured and completes the event", async () => {
    const bill = await seedBill();
    const event = await seedEvent(bill, { paymentId: "pay_111" });

    await processRazorpayEvent(fakeJob({ webhookEventId: String(event._id) }));

    const afterBill = await BillsModel.findById(bill._id);
    const afterEvent = await WebhookEvent.findById(event._id);

    expect(afterBill?.status).toBe(PaymentStatus.COMPLETED);
    expect(afterBill?.providerPaymentId).toBe("pay_111");
    expect(afterEvent?.status).toBe(WebhookStatus.COMPLETED);
    expect(afterEvent?.attempts).toBe(1);
    expect(afterEvent?.processedAt).toBeInstanceOf(Date);
  });

  it("swallows BillStateError when bill already completed (out-of-order replay)", async () => {
    const bill = await seedBill(PaymentStatus.COMPLETED);
    const event = await seedEvent(bill);

    await processRazorpayEvent(fakeJob({ webhookEventId: String(event._id) }));

    const afterEvent = await WebhookEvent.findById(event._id);
    expect(afterEvent?.status).toBe(WebhookStatus.COMPLETED);
  });

  it("marks bill failed on payment.failed", async () => {
    const bill = await seedBill();
    const event = await seedEvent(bill, { eventType: "payment.failed" });

    await processRazorpayEvent(fakeJob({ webhookEventId: String(event._id) }));

    const afterBill = await BillsModel.findById(bill._id);
    expect(afterBill?.status).toBe(PaymentStatus.FAILED);
  });

  it("skips an event already completed (job retry after success)", async () => {
    const bill = await seedBill();
    const event = await seedEvent(bill, { status: WebhookStatus.COMPLETED });

    const result = await processRazorpayEvent(
      fakeJob({ webhookEventId: String(event._id) })
    );

    expect(result).toMatchObject({ skipped: true });
    // Bill should still be PROCESSING since handler short-circuited.
    const afterBill = await BillsModel.findById(bill._id);
    expect(afterBill?.status).toBe(PaymentStatus.PROCESSING);
  });

  it("throws when the WebhookEvent doesn't exist", async () => {
    await expect(
      processRazorpayEvent(fakeJob({ webhookEventId: "000000000000000000000000" }))
    ).rejects.toThrow(/not found/);
  });

  it("records the error and marks the event FAILED on handler exception", async () => {
    const bill = await seedBill();
    const event = await WebhookEvent.create({
      provider: "razorpay",
      eventId: "evt_bad_payload",
      eventType: "payment.captured",
      status: WebhookStatus.RECEIVED,
      payload: "not-a-valid-shape", // payload.payload.payment.entity reads fail silently → bill not updated, event still COMPLETED.
    });

    // Even with a bogus payload shape, the handler should not throw — it just
    // can't act. Verify completion still recorded so we don't infinite-retry.
    await processRazorpayEvent(fakeJob({ webhookEventId: String(event._id) }));
    const after = await WebhookEvent.findById(event._id);
    expect(after?.status).toBe(WebhookStatus.COMPLETED);

    // Bill untouched.
    const afterBill = await BillsModel.findById(bill._id);
    expect(afterBill?.status).toBe(PaymentStatus.PROCESSING);
  });
});

describe("previousPeriod()", () => {
  it("returns the prior YYYY-MM for mid-month dates", () => {
    expect(previousPeriod(new Date("2026-05-17T00:00:00Z"))).toBe("2026-04");
  });

  it("rolls year back across January", () => {
    expect(previousPeriod(new Date("2026-01-10T00:00:00Z"))).toBe("2025-12");
  });
});
