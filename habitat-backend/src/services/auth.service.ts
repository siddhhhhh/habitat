import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User, { IUser } from "../models/user.model";
import RefreshToken, { IRefreshToken } from "../models/refreshToken.model";
import { env } from "../config/env";

export const createUser = async (payload: Partial<IUser>): Promise<IUser> => {
  const existing = await User.findOne({ email: payload.email });
  if (existing) throw new Error("Email already registered");

  const salt = await bcrypt.genSalt(env.BCRYPT_SALT_ROUNDS);
  const hashedPassword = await bcrypt.hash(payload.password!, salt);

  const user = new User({
    name: payload.name,
    email: payload.email,
    password: hashedPassword,
    phone: payload.phone,
    role: payload.role ?? "resident",
    flatNumber: payload.flatNumber,
    building: payload.building,
    occupantsCount: payload.occupantsCount,
    profile: payload.profile,
  });

  await user.save();
  return user;
};

export const validatePassword = async (candidate: string, hash: string) => {
  return bcrypt.compare(candidate, hash);
};

export const generateAccessToken = (user: Partial<IUser>): string => {
  const payload = { id: user._id, email: user.email, role: user.role };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_ACCESS_TTL_SECONDS });
};

export const verifyAccessToken = (token: string) => {
  return jwt.verify(token, env.JWT_SECRET) as { id: string; email: string; role: string };
};

const hashToken = (raw: string) => crypto.createHash("sha256").update(raw).digest("hex");

export interface IssuedRefreshToken {
  raw: string;
  record: IRefreshToken;
}

export const issueRefreshToken = async (
  userId: string,
  family?: string
): Promise<IssuedRefreshToken> => {
  const raw = crypto.randomBytes(48).toString("base64url");
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL_SECONDS * 1000);

  const record = await RefreshToken.create({
    tokenHash,
    user: userId,
    family: family ?? crypto.randomUUID(),
    expiresAt,
  });

  return { raw, record };
};

export const rotateRefreshToken = async (
  presented: string
): Promise<{ user: IUser; access: string; refresh: string }> => {
  const tokenHash = hashToken(presented);
  const existing = await RefreshToken.findOne({ tokenHash });

  if (!existing) {
    throw new Error("Invalid refresh token");
  }

  if (existing.expiresAt.getTime() < Date.now()) {
    throw new Error("Refresh token expired");
  }

  if (existing.revokedAt) {
    // Reuse of an already-rotated token → assume compromise; revoke whole family.
    await RefreshToken.updateMany(
      { family: existing.family, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } }
    );
    throw new Error("Refresh token reuse detected; session revoked");
  }

  const user = await User.findById(existing.user);
  if (!user || !user.isActive) {
    throw new Error("User no longer active");
  }

  const issued = await issueRefreshToken(String(user._id), existing.family);

  existing.revokedAt = new Date();
  existing.replacedByHash = issued.record.tokenHash;
  await existing.save();

  const access = generateAccessToken(user);
  return { user, access, refresh: issued.raw };
};

export const revokeRefreshToken = async (presented: string): Promise<void> => {
  const tokenHash = hashToken(presented);
  await RefreshToken.updateOne(
    { tokenHash, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } }
  );
};

export const revokeAllForUser = async (userId: string): Promise<void> => {
  await RefreshToken.updateMany(
    { user: userId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } }
  );
};
