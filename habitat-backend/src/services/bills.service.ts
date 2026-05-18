import BillsModel, { IBills, PaymentStatus } from "../models/bills.model";

interface GetBillsParams {
  userId?: string;
  status?: PaymentStatus | string;
}

const ALLOWED_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  [PaymentStatus.PENDING]: [PaymentStatus.PROCESSING, PaymentStatus.FAILED, PaymentStatus.OVERDUE],
  [PaymentStatus.PROCESSING]: [PaymentStatus.COMPLETED, PaymentStatus.FAILED, PaymentStatus.PENDING],
  [PaymentStatus.COMPLETED]: [PaymentStatus.REFUNDED],
  [PaymentStatus.FAILED]: [PaymentStatus.PENDING],
  [PaymentStatus.REFUNDED]: [],
  [PaymentStatus.OVERDUE]: [PaymentStatus.PROCESSING, PaymentStatus.FAILED],
};

export class BillStateError extends Error {
  constructor(
    message: string,
    public readonly billId: string,
    public readonly from?: PaymentStatus,
    public readonly to?: PaymentStatus
  ) {
    super(message);
    this.name = "BillStateError";
  }
}

export class BillsService {
  async getAll(params?: GetBillsParams): Promise<IBills[]> {
    const query: any = {};
    if (params?.userId) query.user = params.userId;
    if (params?.status) query.status = params.status;
    return BillsModel.find(query).populate("user", "name flatNumber").sort({ createdAt: -1 });
  }

  async getById(id: string) {
    return BillsModel.findById(id).populate("user", "name flatNumber");
  }

  async create(data: Partial<IBills>) {
    return BillsModel.create(data);
  }

  async update(id: string, data: Partial<IBills>) {
    return BillsModel.findByIdAndUpdate(id, data, { new: true }).populate("user", "name flatNumber");
  }

  async delete(id: string) {
    return BillsModel.findByIdAndDelete(id);
  }

  async generateBills(billsData: { user: string; description: string; amount: number; dueDate: Date }[]) {
    return BillsModel.insertMany(billsData);
  }

  /**
   * Transition a bill to a new status using a guarded findOneAndUpdate so the
   * filter contains the expected current status. If the document has already
   * moved on (concurrent webhook, race), the update returns null and we throw —
   * preventing illegal or duplicate transitions.
   */
  async transition(
    billId: string,
    from: PaymentStatus,
    to: PaymentStatus,
    extra: Partial<IBills> = {}
  ): Promise<IBills> {
    if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
      throw new BillStateError(`Illegal transition ${from} → ${to}`, billId, from, to);
    }

    const updated = await BillsModel.findOneAndUpdate(
      { _id: billId, status: from },
      { $set: { status: to, ...extra } },
      { new: true }
    );

    if (!updated) {
      throw new BillStateError(
        `Bill not in expected state '${from}' (concurrent update or not found)`,
        billId,
        from,
        to
      );
    }

    return updated;
  }

  /**
   * Begin payment processing. A bill can enter PROCESSING from either PENDING
   * (normal flow) or OVERDUE (resident pays a late bill). The atomic $in filter
   * keeps the optimistic-lock guarantee.
   */
  async markProcessing(billId: string, providerOrderId: string, provider = "razorpay") {
    const updated = await BillsModel.findOneAndUpdate(
      { _id: billId, status: { $in: [PaymentStatus.PENDING, PaymentStatus.OVERDUE] } },
      {
        $set: {
          status: PaymentStatus.PROCESSING,
          provider,
          providerOrderId,
        },
      },
      { new: true }
    );
    if (!updated) {
      throw new BillStateError(
        "Bill not in a payable state (must be pending or overdue)",
        billId,
        undefined,
        PaymentStatus.PROCESSING
      );
    }
    return updated;
  }

  async markPaid(billId: string, providerPaymentId: string) {
    return this.transition(billId, PaymentStatus.PROCESSING, PaymentStatus.COMPLETED, {
      providerPaymentId,
      gatewayRef: providerPaymentId,
      paidAt: new Date(),
    });
  }

  async markFailed(billId: string, from: PaymentStatus = PaymentStatus.PROCESSING) {
    return this.transition(billId, from, PaymentStatus.FAILED);
  }

  /**
   * Flip all PENDING bills whose dueDate is before `cutoff` to OVERDUE in a
   * single bulk write. Used by the daily overdue-scanner job. The filter is
   * idempotent — running it twice has no effect on already-OVERDUE rows.
   */
  async markOverdueBefore(cutoff: Date) {
    const result = await BillsModel.updateMany(
      { status: PaymentStatus.PENDING, dueDate: { $lt: cutoff } },
      { $set: { status: PaymentStatus.OVERDUE } }
    );
    return { matched: result.matchedCount, modified: result.modifiedCount };
  }

  /**
   * Manual override (admin/committee) — keeps the legacy /pay endpoint working.
   * Goes pending → processing → completed in one shot but still validates state.
   */
  async payBillManual(id: string, amount: number, gatewayRef: string) {
    const bill = await BillsModel.findById(id);
    if (!bill) throw new Error("Bill not found");
    if (bill.status !== PaymentStatus.PENDING) throw new Error("Bill already paid or closed");
    if (amount < bill.amount) throw new Error("Amount cannot be less than bill amount");

    const processing = await this.markProcessing(id, gatewayRef, "manual");
    return this.markPaid(processing._id as string, gatewayRef);
  }
}
