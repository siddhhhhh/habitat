import { UserRole } from "../utils/enums";

export const roleRoom = (role: UserRole | string) => `role:${role}`;
export const userRoom = (userId: string) => `user:${userId}`;

export const ALL_ROLE_ROOMS = Object.values(UserRole).map(roleRoom);
