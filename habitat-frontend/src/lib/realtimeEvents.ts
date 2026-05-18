/**
 * Event names the backend emits over Socket.IO. Keep these in sync with
 * `habitat-backend/src/realtime/events.ts` — the wire format only works if
 * both ends spell the names the same way.
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

export interface BillPaidPayload {
  billId: string;
  amount: number;
  paidAt?: string;
}

export interface BillFailedPayload {
  billId: string;
}

export interface NoticeCreatedPayload {
  _id: string;
  title: string;
  description?: string;
  audience?: string[];
}

export interface IssueUpdatedPayload {
  _id: string;
  title: string;
  status: string;
  reporter?: { _id: string; name?: string } | string;
  technician?: { _id: string; name?: string } | string | null;
}

export interface BookingDecisionPayload {
  _id: string;
  status: string;
  userId?: { _id: string; name?: string } | string;
  amenityId?: { _id: string; name?: string } | string;
}

export interface VisitorAlertPayload {
  _id: string;
  name: string;
  flatNumber?: string;
  inTime?: string;
  outTime?: string;
}
