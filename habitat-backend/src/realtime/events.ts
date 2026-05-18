import { getIO } from ".";
import { roleRoom, userRoom } from "./rooms";
import { recordEvent } from "./replay";
import { UserRole } from "../utils/enums";

/**
 * Domain-level event names. Centralised so frontend and backend agree on the
 * wire format — change one place, search-all reveals every emit/handler.
 */
export const RealtimeEvents = {
  NoticeCreated: "notice.created",
  BillPaid: "bill.paid",
  BillFailed: "bill.failed",
  BillOverdue: "bill.overdue",
  BookingDecision: "booking.decision",
  IssueUpdated: "issue.updated",
  VisitorAlert: "visitor.alert",
} as const;
export type RealtimeEvent = (typeof RealtimeEvents)[keyof typeof RealtimeEvents];

const emit = async (room: string, event: string, data: unknown): Promise<void> => {
  const io = getIO();
  if (!io) return; // real-time not initialised (e.g. unit-only tests)
  io.to(room).emit(event, data);
  await recordEvent(room, event, data);
};

export const emitToUser = async (userId: string, event: string, data: unknown) =>
  emit(userRoom(userId), event, data);

export const emitToRole = async (role: UserRole | string, event: string, data: unknown) =>
  emit(roleRoom(role), event, data);

export const emitToRoles = async (
  roles: (UserRole | string)[],
  event: string,
  data: unknown
) => {
  for (const r of roles) await emit(roleRoom(r), event, data);
};

/** Broadcast a notice to its audience. Audience values match UserRole. */
export const emitNoticeCreated = async (audience: string[], notice: unknown) => {
  if (!audience?.length) {
    // No audience filter? treat as society-wide.
    await emitToRoles(Object.values(UserRole), RealtimeEvents.NoticeCreated, notice);
    return;
  }
  await emitToRoles(audience, RealtimeEvents.NoticeCreated, notice);
};
