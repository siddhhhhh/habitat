import { Request, Response } from "express";
import BillsModel, { PaymentStatus } from "../models/bills.model";
import { BillsService, BillStateError } from "../services/bills.service";
import { createOrder } from "../services/payments.service";
import { razorpayConfigured, env } from "../config/env";

const bills = new BillsService();

export class PaymentsController {
  /**
   * Resident clicks "Pay" → backend creates a Razorpay order, transitions the
   * bill to processing, and returns details the frontend needs to open Razorpay
   * Checkout (key id + order id + amount).
   */
  async checkout(req: Request, res: Response) {
    if (!razorpayConfigured()) {
      return res.status(503).json({ success: false, message: "Payments not configured" });
    }

    const billId = req.params.id;
    const bill = await BillsModel.findById(billId);
    if (!bill) {
      return res.status(404).json({ success: false, message: "Bill not found" });
    }
    if (bill.status !== PaymentStatus.PENDING) {
      return res.status(409).json({
        success: false,
        message: `Bill is already in '${bill.status}' state`,
      });
    }

    try {
      const order = await createOrder({
        amountInRupees: bill.amount,
        receipt: `bill_${bill._id}`,
        notes: { billId: String(bill._id), userId: String(bill.user) },
      });

      const updated = await bills.markProcessing(String(bill._id), order.id);

      return res.json({
        success: true,
        data: {
          keyId: env.RAZORPAY_KEY_ID,
          orderId: order.id,
          amount: order.amount,
          currency: order.currency,
          billId: String(updated._id),
        },
      });
    } catch (err: any) {
      if (err instanceof BillStateError) {
        return res.status(409).json({ success: false, message: err.message });
      }
      return res.status(500).json({ success: false, message: err.message || "Checkout failed" });
    }
  }
}
