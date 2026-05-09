import mongoose, { Schema, Document } from "mongoose";

export enum PaymentStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
  REFUNDED = "refunded",
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
  },
  { timestamps: true }
);

billsSchema.index({ user: 1, status: 1, dueDate: -1 });

export default mongoose.model<IBills>("Bills", billsSchema);
