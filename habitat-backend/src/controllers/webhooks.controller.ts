import { Request, Response } from "express";
import WebhookEvent from "../models/webhookEvent.model";
import { BillsService, BillStateError } from "../services/bills.service";
import { verifyWebhookSignature } from "../services/payments.service";
import { razorpayWebhookConfigured } from "../config/env";
import { PaymentStatus } from "../models/bills.model";

const bills = new BillsService();

const isDuplicateKeyError = (err: any) => err && err.code === 11000;

interface RazorpayWebhookBody {
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
 * Razorpay webhook receiver.
 *
 * Idempotency layers:
 *   1. WebhookEvent.eventId has a unique index — duplicate deliveries from
 *      Razorpay's at-least-once retry are caught here and short-circuited.
 *   2. Bill state-machine transitions are guarded by current status (optimistic
 *      lock). If a payment.captured webhook arrives twice in close succession,
 *      the second transition no-ops gracefully.
 */
export const razorpayWebhook = async (req: Request, res: Response) => {
  if (!razorpayWebhookConfigured()) {
    return res.status(503).json({ success: false, message: "Webhook not configured" });
  }

  const signature = req.headers["x-razorpay-signature"];
  const rawBody = (req as any).rawBody as Buffer | undefined;

  if (typeof signature !== "string" || !rawBody) {
    return res.status(400).json({ success: false, message: "Missing signature or body" });
  }

  let valid = false;
  try {
    valid = verifyWebhookSignature(rawBody, signature);
  } catch {
    valid = false;
  }
  if (!valid) {
    return res.status(401).json({ success: false, message: "Invalid signature" });
  }

  const body = req.body as RazorpayWebhookBody & { id?: string; event_id?: string };
  const eventId = (body.id || body.event_id || `${body.event}_${signature.slice(0, 16)}`) as string;

  // Idempotent receipt: unique-index insert is atomic.
  try {
    await WebhookEvent.create({
      provider: "razorpay",
      eventId,
      eventType: body.event ?? "unknown",
      payload: body,
    });
  } catch (err: any) {
    if (isDuplicateKeyError(err)) {
      return res.json({ success: true, message: "Already processed" });
    }
    throw err;
  }

  const payment = body.payload?.payment?.entity;
  const billId = payment?.notes?.billId;

  if (body.event === "payment.captured" && billId && payment) {
    try {
      await bills.markPaid(billId, payment.id);
    } catch (err) {
      if (!(err instanceof BillStateError)) throw err;
      // Bill already moved on — fine, second delivery.
    }
  } else if (body.event === "payment.failed" && billId) {
    try {
      await bills.markFailed(billId, PaymentStatus.PROCESSING);
    } catch (err) {
      if (!(err instanceof BillStateError)) throw err;
    }
  }

  return res.json({ success: true });
};
