import { Request, Response } from "express";
import WebhookEvent, { WebhookStatus } from "../models/webhookEvent.model";
import { verifyWebhookSignature } from "../services/payments.service";
import { razorpayWebhookConfigured, redisConfigured } from "../config/env";
import { enqueueRazorpayEvent } from "../queues/webhooks.queue";
import { processRazorpayEvent } from "../queues/webhooks.handlers";

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
 * Flow:
 *   1. Verify HMAC signature against the raw body.
 *   2. Persist a WebhookEvent under a unique eventId (idempotency layer 1).
 *   3. Enqueue async processing and ACK 200 OK — Razorpay's webhook timeout
 *      is 5s, so we never let downstream Mongo writes block the response.
 *
 * If Redis is not configured (dev / portfolio without infra), fall back to
 * inline processing so the end-to-end flow still works.
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

  let event;
  try {
    event = await WebhookEvent.create({
      provider: "razorpay",
      eventId,
      eventType: body.event ?? "unknown",
      payload: body,
      status: WebhookStatus.RECEIVED,
    });
  } catch (err: any) {
    if (isDuplicateKeyError(err)) {
      return res.json({ success: true, message: "Already processed" });
    }
    throw err;
  }

  if (redisConfigured()) {
    await enqueueRazorpayEvent({ webhookEventId: String(event._id) });
    return res.json({ success: true, message: "Queued" });
  }

  // No Redis — degrade to inline processing so the API still works in dev.
  try {
    await processRazorpayEvent({ data: { webhookEventId: String(event._id) } } as any);
  } catch (err) {
    console.error("[webhooks] inline processing failed:", (err as Error).message);
  }
  return res.json({ success: true, message: "Processed inline (no Redis)" });
};
