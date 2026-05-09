import bcrypt from "bcryptjs";
import User from "../../models/user.model";
import { UserRole } from "../../utils/enums";
import { generateAccessToken } from "../../services/auth.service";

export interface SeededUser {
  user: any;
  password: string;
  accessToken: string;
}

export const createUser = async (overrides: Partial<{
  name: string;
  email: string;
  password: string;
  role: UserRole;
  flatNumber: string;
  isActive: boolean;
}> = {}): Promise<SeededUser> => {
  const password = overrides.password ?? "password123";
  const hashed = await bcrypt.hash(password, 4);
  const user = await User.create({
    name: overrides.name ?? "Test User",
    email: overrides.email ?? `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@test.com`,
    password: hashed,
    role: overrides.role ?? UserRole.Resident,
    flatNumber: overrides.flatNumber,
    isActive: overrides.isActive ?? true,
  });
  return { user, password, accessToken: generateAccessToken(user) };
};

export const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });
