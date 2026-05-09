import mongoose, { Schema, Document } from "mongoose";

export interface IWebhookEvent extends Document {
  provider: string;
  eventId: string;
  eventType: string;
  payload: unknown;
  bill?: mongoose.Types.ObjectId;
  processedAt: Date;
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
    processedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model<IWebhookEvent>("WebhookEvent", webhookEventSchema);
