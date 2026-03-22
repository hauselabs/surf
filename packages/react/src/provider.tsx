'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { SurfContext, type ConnectionStatus, type EventCallback, type SurfResult } from './context.js';

/** Props for the SurfProvider component. */
export interface SurfProviderProps {
  /** WebSocket URL to connect to (e.g. "wss://myapp.com/surf/ws"). */
  url: string;
  /** Auth token to send on connect. */
  auth?: string;
  /** Channels to subscribe to on connect. */
  channels?: string[];
  /** Children to render. */
  children: ReactNode;
}

interface PendingRequest {
  resolve: (result: SurfResult) => void;
  reject: (error: Error) => void;
}

interface WsMessage {
  type: string;
  id?: string;
  event?: string;
  ok?: boolean;
  result?: unknown;
  error?: { code: string; message: string };
  state?: Record<string, unknown>;
  data?: unknown;
}

const MAX_RECONNECT_DELAY = 30_000;

/**
 * SurfProvider — wraps your app with a Surf WebSocket connection.
 *
 * Creates a single WebSocket connection shared via React context.
 * Auto-reconnects with exponential backoff (1s → 2s → 4s → 8s → max 30s).
 */
export function SurfProvider({ url, auth, channels, children }: SurfProviderProps) {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [subscribedChannels, setSubscribedChannels] = useState<Set<string>>(new Set());

  const wsRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef<Map<string, PendingRequest>>(new Map());
  const listenersRef = useRef<Map<string, Set<EventCallback>>>(new Map());
  const msgCounterRef = useRef(0);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const channelsRef = useRef(channels);
  const authRef = useRef(auth);
  const subscribedChannelsRef = useRef<Set<string>>(new Set(channels ?? []));

  // Keep refs in sync
  channelsRef.current = channels;
  authRef.current = auth;

  const sendRaw = useCallback((data: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    setStatus('connecting');
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) { ws.close(); return; }
      reconnectAttemptRef.current = 0;
      setStatus('connected');

      // Send auth token if provided
      if (authRef.current) {
        ws.send(JSON.stringify({ type: 'auth', token: authRef.current }));
      }

      // Re-subscribe to all channels (initial + dynamically added)
      const allChannels = new Set([
        ...(channelsRef.current ?? []),
        ...subscribedChannelsRef.current,
      ]);
      if (allChannels.size > 0) {
        ws.send(JSON.stringify({ type: 'subscribe', channels: [...allChannels] }));
        setSubscribedChannels(allChannels);
        subscribedChannelsRef.current = allChannels;
      }
    };

    ws.onmessage = (ev) => {
      let msg: WsMessage;
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)) as WsMessage;
      } catch {
        return;
      }

      if (msg.type === 'result' && msg.id) {
        const pending = pendingRef.current.get(msg.id);
        if (pending) {
          pendingRef.current.delete(msg.id);
          if (msg.id === 'session' && msg.ok && msg.result) {
            const res = msg.result as { sessionId: string };
            setSessionId(res.sessionId);
          }
          pending.resolve({
            ok: msg.ok ?? false,
            result: msg.result,
            error: msg.error,
            state: msg.state,
          });
        }
      } else if (msg.type === 'event' && msg.event) {
        const set = listenersRef.current.get(msg.event);
        if (set) {
          for (const cb of set) {
            try { cb(msg.data); } catch { /* swallow */ }
          }
        }
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      // Reject all pending requests
      for (const [, pending] of pendingRef.current) {
        pending.reject(new Error('WebSocket closed'));
      }
      pendingRef.current.clear();

      if (!mountedRef.current) {
        setStatus('disconnected');
        return;
      }

      // Auto-reconnect with exponential backoff
      setStatus('reconnecting');
      const attempt = reconnectAttemptRef.current++;
      const delay = Math.min(1000 * Math.pow(2, attempt), MAX_RECONNECT_DELAY);
      reconnectTimerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      // onclose will fire after onerror
    };
  }, [url, sendRaw]);

  // Connect on mount
  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  const execute = useCallback((command: string, params?: Record<string, unknown>): Promise<SurfResult> => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('WebSocket not connected'));
    }

    const id = `msg_${++msgCounterRef.current}`;
    return new Promise<SurfResult>((resolve, reject) => {
      pendingRef.current.set(id, { resolve, reject });
      ws.send(JSON.stringify({
        type: 'execute',
        id,
        command,
        params: params ?? {},
      }));
    });
  }, []);

  const subscribe = useCallback((event: string, callback: EventCallback): (() => void) => {
    let set = listenersRef.current.get(event);
    if (!set) {
      set = new Set();
      listenersRef.current.set(event, set);
    }
    set.add(callback);
    return () => set.delete(callback);
  }, []);

  const subscribeChannel = useCallback((channelId: string) => {
    sendRaw({ type: 'subscribe', channels: [channelId] });
    subscribedChannelsRef.current.add(channelId);
    setSubscribedChannels(prev => {
      const next = new Set(prev);
      next.add(channelId);
      return next;
    });
  }, [sendRaw]);

  const unsubscribeChannel = useCallback((channelId: string) => {
    sendRaw({ type: 'unsubscribe', channels: [channelId] });
    subscribedChannelsRef.current.delete(channelId);
    setSubscribedChannels(prev => {
      const next = new Set(prev);
      next.delete(channelId);
      return next;
    });
  }, [sendRaw]);

  const contextValue = {
    execute,
    status,
    connected: status === 'connected',
    sessionId,
    subscribe,
    subscribeChannel,
    unsubscribeChannel,
    channels: subscribedChannels,
  };

  return (
    <SurfContext.Provider value={contextValue}>
      {children}
    </SurfContext.Provider>
  );
}
