import mongoose, { Schema, Document } from "mongoose";

export enum PaymentStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
  REFUNDED = "refunded",
  OVERDUE = "overdue",
}

export interface IBills extends Document {
  user: mongoose.Types.ObjectId;
  description: string;
  amount: number;
  dueDate: Date;
  status: PaymentStatus;
  provider?: string;
  providerOrderId?: string;
  providerPaymentId?: string;
  gatewayRef?: string;
  paidAt?: Date;
  period?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const billsSchema = new Schema<IBills>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    description: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    dueDate: { type: Date, required: true },
    status: {
      type: String,
      enum: Object.values(PaymentStatus),
      default: PaymentStatus.PENDING,
      index: true,
    },
    provider: { type: String },
    providerOrderId: { type: String, index: true, sparse: true },
    providerPaymentId: { type: String, index: true, sparse: true },
    gatewayRef: { type: String },
    paidAt: { type: Date },
    period: { type: String },
  },
  { timestamps: true }
);

billsSchema.index({ user: 1, status: 1, dueDate: -1 });
// Idempotency guard for the monthly bill-generator job — only one bill per
// (user, period) can exist. Partial index so legacy bills without `period`
// remain unaffected.
billsSchema.index(
  { user: 1, period: 1 },
  { unique: true, partialFilterExpression: { period: { $exists: true } } }
);

export default mongoose.model<IBills>("Bills", billsSchema);
