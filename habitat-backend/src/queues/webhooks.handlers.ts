import type { Job } from "bullmq";
import WebhookEvent, { WebhookStatus } from "../models/webhookEvent.model";
import { BillsService, BillStateError } from "../services/bills.service";
import { PaymentStatus } from "../models/bills.model";
import { emitToUser } from "../realtime/events";
import { RealtimeEvents } from "../realtime/events";
import type { ProcessRazorpayEventData } from "./types";

const bills = new BillsService();

interface RazorpayPayloadShape {
  event: string;
  payload?: {
    payment?: {
      entity?: {
        id: string;
        order_id: string;
        status: string;
        notes?: Record<string, string>;
      };
    };
  };
}

/**
 * Apply the side effects of a previously persisted Razorpay webhook event.
 *
 * This handler is the async tail of the webhook controller. The controller
 * verifies the HMAC signature, persists the event under a unique eventId,
 * and returns 200 fast. This worker does the heavy lifting (bill state
 * transitions) and updates the WebhookEvent status for audit visibility.
 *
 * Idempotency guarantees:
 *   1. eventId unique index — duplicate Razorpay deliveries never reach here.
 *   2. Bill state-machine optimistic lock — out-of-order delivery (failed
 *      after captured) cannot regress a completed bill.
 */
export const processRazorpayEvent = async (job: Job<ProcessRazorpayEventData>) => {
  const event = await WebhookEvent.findById(job.data.webhookEventId);
  if (!event) {
    throw new Error(`WebhookEvent ${job.data.webhookEventId} not found`);
  }
  if (event.status === WebhookStatus.COMPLETED) {
    return { skipped: true, reason: "already completed" };
  }

  event.status = WebhookStatus.PROCESSING;
  event.attempts += 1;
  await event.save();

  const payload = event.payload as RazorpayPayloadShape;
  const payment = payload.payload?.payment?.entity;
  const billId = payment?.notes?.billId;

  try {
    if (event.eventType === "payment.captured" && billId && payment) {
      try {
        const bill = await bills.markPaid(billId, payment.id);
        event.bill = bill._id as any;
        await emitToUser(String(bill.user), RealtimeEvents.BillPaid, {
          billId: String(bill._id),
          amount: bill.amount,
          paidAt: bill.paidAt,
        });
      } catch (err) {
        if (!(err instanceof BillStateError)) throw err;
        // Bill already moved on (e.g. concurrent manual mark) — webhook delivery
        // was correct, just redundant. Treat as success.
      }
    } else if (event.eventType === "payment.failed" && billId) {
      try {
        const bill = await bills.markFailed(billId, PaymentStatus.PROCESSING);
        await emitToUser(String(bill.user), RealtimeEvents.BillFailed, {
          billId: String(bill._id),
        });
      } catch (err) {
        if (!(err instanceof BillStateError)) throw err;
      }
    }

    event.status = WebhookStatus.COMPLETED;
    event.processedAt = new Date();
    event.lastError = undefined;
    await event.save();
    return { processed: true, eventType: event.eventType };
  } catch (err: any) {
    event.status = WebhookStatus.FAILED;
    event.lastError = err?.message ?? String(err);
    await event.save();
    throw err; // let BullMQ retry per backoff policy
  }
};
