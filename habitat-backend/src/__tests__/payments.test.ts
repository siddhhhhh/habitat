import crypto from "crypto";
import request from "supertest";
import { createApp } from "../app";
import { connectTestDb, disconnectTestDb, clearTestDb } from "./helpers/db";
import { createUser, authHeader } from "./helpers/factories";
import { UserRole } from "../utils/enums";
import BillsModel, { PaymentStatus } from "../models/bills.model";
import WebhookEvent from "../models/webhookEvent.model";
import { BillsService, BillStateError } from "../services/bills.service";

const app = createApp();
const bills = new BillsService();

const sign = (body: string) =>
  crypto.createHmac("sha256", "test-webhook-secret").update(body).digest("hex");

beforeAll(async () => {
  await connectTestDb();
});
afterAll(async () => {
  await disconnectTestDb();
});
beforeEach(async () => {
  await clearTestDb();
});

const seedBill = async (status: PaymentStatus = PaymentStatus.PENDING) => {
  const { user } = await createUser({ role: UserRole.Resident });
  return BillsModel.create({
    user: user._id,
    description: "Maintenance Jan",
    amount: 1500,
    dueDate: new Date(),
    status,
  });
};

describe("BillsService.transition (state machine)", () => {
  it("permits pending → processing", async () => {
    const bill = await seedBill();
    const updated = await bills.markProcessing(String(bill._id), "order_abc");
    expect(updated.status).toBe(PaymentStatus.PROCESSING);
    expect(updated.providerOrderId).toBe("order_abc");
  });

  it("permits processing → completed", async () => {
    const bill = await seedBill(PaymentStatus.PROCESSING);
    const updated = await bills.markPaid(String(bill._id), "pay_xyz");
    expect(updated.status).toBe(PaymentStatus.COMPLETED);
    expect(updated.providerPaymentId).toBe("pay_xyz");
    expect(updated.paidAt).toBeInstanceOf(Date);
  });

  it("rejects illegal transition completed → processing", async () => {
    const bill = await seedBill(PaymentStatus.COMPLETED);
    await expect(
      bills.transition(String(bill._id), PaymentStatus.COMPLETED, PaymentStatus.PROCESSING)
    ).rejects.toThrow(BillStateError);
  });

  it("rejects double-paying via state guard (concurrent capture)", async () => {
    const bill = await seedBill(PaymentStatus.PROCESSING);
    await bills.markPaid(String(bill._id), "pay_first");
    await expect(bills.markPaid(String(bill._id), "pay_second")).rejects.toThrow(BillStateError);

    const after = await BillsModel.findById(bill._id);
    expect(after?.providerPaymentId).toBe("pay_first");
  });
});

describe("POST /api/bills/:id/checkout", () => {
  it("returns 503 when Razorpay is not configured", async () => {
    const { accessToken } = await createUser({ role: UserRole.Resident });
    const bill = await seedBill();
    const res = await request(app)
      .post(`/api/bills/${bill._id}/checkout`)
      .set(authHeader(accessToken));
    expect(res.status).toBe(503);
  });

  it("requires authentication", async () => {
    const bill = await seedBill();
    const res = await request(app).post(`/api/bills/${bill._id}/checkout`);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/webhooks/razorpay", () => {
  it("rejects requests with an invalid signature", async () => {
    const body = { event: "payment.captured", id: "evt_1", payload: {} };
    const json = JSON.stringify(body);

    const res = await request(app)
      .post("/api/webhooks/razorpay")
      .set("Content-Type", "application/json")
      .set("X-Razorpay-Signature", "definitely-wrong")
      .send(json);

    expect(res.status).toBe(401);
  });

  it("accepts a correctly signed payment.captured and marks the bill paid", async () => {
    const bill = await seedBill();
    await bills.markProcessing(String(bill._id), "order_abc");

    const body = {
      id: "evt_captured_1",
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_111",
            order_id: "order_abc",
            status: "captured",
            notes: { billId: String(bill._id) },
          },
        },
      },
    };
    const json = JSON.stringify(body);

    const res = await request(app)
      .post("/api/webhooks/razorpay")
      .set("Content-Type", "application/json")
      .set("X-Razorpay-Signature", sign(json))
      .send(json);

    expect(res.status).toBe(200);

    const after = await BillsModel.findById(bill._id);
    expect(after?.status).toBe(PaymentStatus.COMPLETED);
    expect(after?.providerPaymentId).toBe("pay_111");
  });

  it("is idempotent on duplicate eventId", async () => {
    const bill = await seedBill();
    await bills.markProcessing(String(bill._id), "order_abc");

    const body = {
      id: "evt_dup_1",
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_222",
            order_id: "order_abc",
            status: "captured",
            notes: { billId: String(bill._id) },
          },
        },
      },
    };
    const json = JSON.stringify(body);
    const headers = {
      "Content-Type": "application/json",
      "X-Razorpay-Signature": sign(json),
    };

    const first = await request(app).post("/api/webhooks/razorpay").set(headers).send(json);
    const second = await request(app).post("/api/webhooks/razorpay").set(headers).send(json);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.message).toMatch(/already processed/i);

    const events = await WebhookEvent.countDocuments({ eventId: "evt_dup_1" });
    expect(events).toBe(1);
  });

  it("survives an out-of-order replay where the bill is already completed", async () => {
    const bill = await seedBill();
    await bills.markProcessing(String(bill._id), "order_abc");
    await bills.markPaid(String(bill._id), "pay_already_done");

    const body = {
      id: "evt_late_1",
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_replay",
            order_id: "order_abc",
            status: "captured",
            notes: { billId: String(bill._id) },
          },
        },
      },
    };
    const json = JSON.stringify(body);

    const res = await request(app)
      .post("/api/webhooks/razorpay")
      .set("Content-Type", "application/json")
      .set("X-Razorpay-Signature", sign(json))
      .send(json);

    expect(res.status).toBe(200);

    const after = await BillsModel.findById(bill._id);
    expect(after?.status).toBe(PaymentStatus.COMPLETED);
    // The earlier payment id wins; replay does not overwrite it.
    expect(after?.providerPaymentId).toBe("pay_already_done");
  });

  it("handles payment.failed by marking the bill failed", async () => {
    const bill = await seedBill();
    await bills.markProcessing(String(bill._id), "order_abc");

    const body = {
      id: "evt_fail_1",
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: "pay_fail",
            order_id: "order_abc",
            status: "failed",
            notes: { billId: String(bill._id) },
          },
        },
      },
    };
    const json = JSON.stringify(body);

    const res = await request(app)
      .post("/api/webhooks/razorpay")
      .set("Content-Type", "application/json")
      .set("X-Razorpay-Signature", sign(json))
      .send(json);

    expect(res.status).toBe(200);
    const after = await BillsModel.findById(bill._id);
    expect(after?.status).toBe(PaymentStatus.FAILED);
  });
});
