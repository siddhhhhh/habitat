import { Document, Schema, model, Types } from "mongoose";

interface IUserRef {
  _id: string;
  name: string;
  email: string;
}

interface IAmenityRef {
  _id: string;
  name: string;
}

export enum BookingStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
  CANCELLED = "cancelled",
}

export interface IBookings extends Document {
  userId: Types.ObjectId | IUserRef;
  amenityId: Types.ObjectId | IAmenityRef;
  technicianId?: Types.ObjectId;
  startTime: Date;
  endTime: Date;
  status: BookingStatus;
}

const bookingsSchema = new Schema<IBookings>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    amenityId: { type: Schema.Types.ObjectId, ref: "Amenities", required: true },
    // Optional — booked with a specific technician (e.g. clubhouse setup, AV).
    // Lives on the booking, not the amenity, because the assignment can vary
    // per slot.
    technicianId: { type: Schema.Types.ObjectId, ref: "Technicians" },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    status: {
      type: String,
      enum: Object.values(BookingStatus),
      default: BookingStatus.PENDING,
    },
  },
  { timestamps: true }
);

export default model<IBookings>("Bookings", bookingsSchema);
