import crypto from "crypto";
import Razorpay from "razorpay";
import { env, razorpayConfigured, razorpayWebhookConfigured } from "../config/env";

let _client: Razorpay | null = null;

const client = (): Razorpay => {
  if (!razorpayConfigured()) {
    throw new Error("Razorpay is not configured (set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET)");
  }
  if (!_client) {
    _client = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET,
    });
  }
  return _client;
};

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt?: string;
  status: string;
}

export const createOrder = async (params: {
  amountInRupees: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> => {
  const amountInPaise = Math.round(params.amountInRupees * 100);
  const order = await client().orders.create({
    amount: amountInPaise,
    currency: "INR",
    receipt: params.receipt,
    notes: params.notes,
  });
  return {
    id: order.id,
    amount: Number(order.amount),
    currency: order.currency,
    receipt: order.receipt as string | undefined,
    status: order.status,
  };
};

/**
 * HMAC-SHA256 verification of a Razorpay webhook payload.
 * Razorpay sends the signature in the `X-Razorpay-Signature` header. The
 * signature is computed over the raw, byte-exact request body.
 */
export const verifyWebhookSignature = (rawBody: Buffer | string, signature: string): boolean => {
  if (!razorpayWebhookConfigured()) {
    throw new Error("RAZORPAY_WEBHOOK_SECRET is not set");
  }
  const expected = crypto
    .createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  // Constant-time compare to avoid timing leaks.
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

/**
 * For tests — allow swapping the Razorpay client at runtime.
 */
export const __setClientForTests = (mock: Razorpay | null) => {
  _client = mock;
};
