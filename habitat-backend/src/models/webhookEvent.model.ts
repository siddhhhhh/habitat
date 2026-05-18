import mongoose, { Schema, Document } from "mongoose";

export enum WebhookStatus {
  RECEIVED = "received",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
}

export interface IWebhookEvent extends Document {
  provider: string;
  eventId: string;
  eventType: string;
  payload: unknown;
  bill?: mongoose.Types.ObjectId;
  status: WebhookStatus;
  attempts: number;
  lastError?: string;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const webhookEventSchema = new Schema<IWebhookEvent>(
  {
    provider: { type: String, required: true, index: true },
    eventId: { type: String, required: true, unique: true, index: true },
    eventType: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    bill: { type: Schema.Types.ObjectId, ref: "Bills" },
    status: {
      type: String,
      enum: Object.values(WebhookStatus),
      default: WebhookStatus.RECEIVED,
      index: true,
    },
    attempts: { type: Number, default: 0 },
    lastError: { type: String },
    processedAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model<IWebhookEvent>("WebhookEvent", webhookEventSchema);
