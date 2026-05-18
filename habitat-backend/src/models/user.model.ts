import mongoose, { Schema, Document } from "mongoose";
import { UserRole } from "../utils/enums";

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role: UserRole;
  flatNumber?: string;
  building?: string;
  occupantsCount?: number;
  profile?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    phone: { type: String },
    role: { type: String, enum: Object.values(UserRole), default: UserRole.Resident },
    flatNumber: { type: String },
    building: { type: String },
    // Number of people sharing the flat. Used by the maintenance generator
    // when usage-based billing is enabled (future), and for population stats.
    occupantsCount: { type: Number, min: 1 },
    // URL or relative path to a profile picture. Optional.
    profile: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model<IUser>("User", UserSchema);
