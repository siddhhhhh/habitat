'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { io, Socket } from 'socket.io-client';
import Cookies from 'js-cookie';
import toast from 'react-hot-toast';
import { useAuth } from './AuthContext';
import {
  RealtimeEvents,
  type BillPaidPayload,
  type BillFailedPayload,
  type NoticeCreatedPayload,
} from '@/lib/realtimeEvents';

interface RealtimeContextType {
  socket: Socket | null;
  connected: boolean;
  /** Subscribe to a specific event for the lifetime of the returned cleanup fn. */
  on: <T = unknown>(event: string, handler: (payload: T) => void) => () => void;
  /** Notify subscribers manually (e.g. test hooks). Real events arrive via `on`. */
}

const RealtimeContext = createContext<RealtimeContextType | undefined>(undefined);

export const useRealtime = () => {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtime must be used inside <RealtimeProvider>');
  return ctx;
};

/**
 * Mounts a single Socket.IO connection scoped to the logged-in user.
 *
 * Behaviour:
 *  - No socket is created while `user` is null. Cuts noise for logged-out pages.
 *  - The JWT cookie is read once on mount; if it rotates, the AuthContext
 *    will trigger a re-mount because `user._id` is in the dep list.
 *  - The last event id received is persisted to sessionStorage so a reconnect
 *    can ask the server for missed events (Redis-Streams replay buffer).
 *  - Built-in toasts for bill.paid / bill.failed / notice.created so a brand
 *    new page benefits from the wiring without writing its own handler.
 */
export const RealtimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const lastEventIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const token = Cookies.get('accessToken');
    if (!token) return;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
    // Socket.IO attaches at the server root, not under /api.
    const socketUrl = apiUrl.replace(/\/api\/?$/, '');

    const lastEventId =
      (typeof window !== 'undefined' && window.sessionStorage.getItem('rt:lastEventId')) ||
      undefined;
    lastEventIdRef.current = lastEventId ?? null;

    const s = io(socketUrl, {
      auth: { token, lastEventId },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', (err) => {
      // Keep this quiet — reconnect handles flakes. Log for debugging.
      console.warn('[realtime] connect error:', err.message);
    });

    // Wire built-in toasts. Pages can layer their own handlers on top.
    s.on(RealtimeEvents.BillPaid, (payload: BillPaidPayload) => {
      stashEventId(payload);
      toast.success(`Bill paid: ₹${payload.amount.toLocaleString('en-IN')}`);
    });
    s.on(RealtimeEvents.BillFailed, (payload: BillFailedPayload) => {
      stashEventId(payload);
      toast.error('Payment failed. Please try again.');
    });
    s.on(RealtimeEvents.NoticeCreated, (payload: NoticeCreatedPayload) => {
      stashEventId(payload);
      toast(`New notice: ${payload.title}`, { icon: '📣' });
    });

    setSocket(s);
    return () => {
      s.removeAllListeners();
      s.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [user?._id]);

  const value = useMemo<RealtimeContextType>(
    () => ({
      socket,
      connected,
      on: <T,>(event: string, handler: (p: T) => void) => {
        if (!socket) return () => {};
        const wrapped = (payload: T) => {
          stashEventId(payload as unknown as Record<string, unknown>);
          handler(payload);
        };
        socket.on(event, wrapped);
        return () => socket.off(event, wrapped);
      },
    }),
    [socket, connected]
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
};

const stashEventId = (payload: unknown): void => {
  if (typeof window === 'undefined') return;
  const id = (payload as { _replayId?: string } | null)?._replayId;
  if (id) window.sessionStorage.setItem('rt:lastEventId', id);
};
