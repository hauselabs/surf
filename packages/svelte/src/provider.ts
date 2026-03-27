import { writable } from 'svelte/store';
import {
  ensureSurf,
  setServerExecutor,
  setServerStatus,
  setManifestUrl,
} from '@surfjs/web';
import type { SurfExecuteResult } from '@surfjs/web';
import type { SurfContextValue, SurfResult, ConnectionStatus, EventCallback } from './types.js';

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

export interface CreateSurfProviderOptions {
  /** WebSocket URL to connect to. */
  url: string;
  /** Auth token to send on connect. */
  auth?: string;
  /** Channels to subscribe to on connect. */
  channels?: string[];
  /** HTTP endpoint for manifest/execute fallback. */
  endpoint?: string;
}

/**
 * Create a Surf connection context.
 *
 * Call this in your top-level Svelte component's script block, then use
 * `getSurfContext()` in child components to access it.
 *
 * Returns a SurfContextValue that manages WebSocket connection, reconnection,
 * and exposes execute/subscribe functions.
 */
export function createSurfProvider(options: CreateSurfProviderOptions): SurfContextValue {
  const status = writable<ConnectionStatus>('disconnected');
  const pending = new Map<string, PendingRequest>();
  const listeners = new Map<string, Set<EventCallback>>();
  let ws: WebSocket | null = null;
  let msgCounter = 0;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;
  const dynamicChannels = new Set<string>(options.channels ?? []);

  function sendRaw(data: unknown) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  function connect() {
    if (destroyed) return;

    status.set('connecting');
    const socket = new WebSocket(options.url);
    ws = socket;

    socket.onopen = () => {
      if (destroyed) { socket.close(); return; }
      reconnectAttempt = 0;
      status.set('connected');

      if (options.auth) {
        socket.send(JSON.stringify({ type: 'auth', token: options.auth }));
      }

      const allChannels = new Set([
        ...(options.channels ?? []),
        ...dynamicChannels,
      ]);
      if (allChannels.size > 0) {
        socket.send(JSON.stringify({ type: 'subscribe', channels: [...allChannels] }));
      }
    };

    socket.onmessage = (ev) => {
      let msg: WsMessage;
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)) as WsMessage;
      } catch {
        return;
      }

      if (msg.type === 'result' && msg.id) {
        const p = pending.get(msg.id);
        if (p) {
          pending.delete(msg.id);
          p.resolve({
            ok: msg.ok ?? false,
            result: msg.result,
            error: msg.error,
            state: msg.state,
          });
        }
      } else if (msg.type === 'event' && msg.event) {
        const set = listeners.get(msg.event);
        if (set) {
          for (const cb of set) {
            try { cb(msg.data); } catch { /* swallow */ }
          }
        }
      }
    };

    socket.onclose = () => {
      ws = null;
      for (const [, p] of pending) {
        p.reject(new Error('WebSocket closed'));
      }
      pending.clear();

      if (destroyed) {
        status.set('disconnected');
        return;
      }

      status.set('reconnecting');
      const attempt = reconnectAttempt++;
      const delay = Math.min(1000 * Math.pow(2, attempt), MAX_RECONNECT_DELAY);
      reconnectTimer = setTimeout(connect, delay);
    };

    socket.onerror = () => {};
  }

  function execute(command: string, params?: Record<string, unknown>): Promise<SurfResult> {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('WebSocket not connected'));
    }

    const id = `msg_${++msgCounter}`;
    return new Promise<SurfResult>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws!.send(JSON.stringify({
        type: 'execute',
        id,
        command,
        params: params ?? {},
      }));
    });
  }

  function subscribe(event: string, callback: EventCallback): () => void {
    let set = listeners.get(event);
    if (!set) {
      set = new Set();
      listeners.set(event, set);
    }
    set.add(callback);
    return () => set.delete(callback);
  }

  function subscribeChannel(channelId: string) {
    sendRaw({ type: 'subscribe', channels: [channelId] });
    dynamicChannels.add(channelId);
  }

  function unsubscribeChannel(channelId: string) {
    sendRaw({ type: 'unsubscribe', channels: [channelId] });
    dynamicChannels.delete(channelId);
  }

  function destroy() {
    destroyed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (statusInterval) clearInterval(statusInterval);
    if (cleanupExecutor) cleanupExecutor();
    setServerStatus('disconnected');
    ws?.close();
    ws = null;
  }

  // Register window.surf
  let cleanupExecutor: (() => void) | null = null;
  let statusInterval: ReturnType<typeof setInterval> | null = null;

  if (typeof window !== 'undefined') {
    ensureSurf();

    if (options.endpoint) {
      setManifestUrl(`${options.endpoint.replace(/\/$/, '')}/.well-known/surf.json`);
    }

    const statusMap: Record<ConnectionStatus, 'connected' | 'disconnected' | 'connecting'> = {
      connected: 'connected',
      connecting: 'connecting',
      disconnected: 'disconnected',
      reconnecting: 'connecting',
    };

    cleanupExecutor = setServerExecutor((command, params) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        return Promise.reject(new Error('WebSocket not connected'));
      }
      const id = `msg_${++msgCounter}`;
      return new Promise<SurfExecuteResult>((resolve, reject) => {
        pending.set(id, {
          resolve: (r) => resolve({ ok: r.ok, result: r.result, error: r.error }),
          reject,
        });
        ws!.send(JSON.stringify({ type: 'execute', id, command, params: params ?? {} }));
      });
    });

    let currentStatus: ConnectionStatus = 'disconnected';
    status.subscribe(s => { currentStatus = s; });

    statusInterval = setInterval(() => {
      setServerStatus(statusMap[currentStatus] ?? 'disconnected');
    }, 500);
  }

  // Start connection
  connect();

  return {
    execute,
    status,
    subscribe,
    subscribeChannel,
    unsubscribeChannel,
    destroy,
  };
}
