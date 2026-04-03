import {
  defineComponent,
  provide,
  ref,
  computed,
  onMounted,
  onUnmounted,
  type InjectionKey,
  type PropType,
} from 'vue';
import {
  ensureSurf,
  setServerExecutor,
  setServerStatus,
  setManifestUrl,
} from '@surfjs/web';
import type { SurfExecuteResult } from '@surfjs/web';
import type { SurfContextValue, SurfResult, ConnectionStatus, EventCallback } from './types.js';

export const SURF_INJECTION_KEY: InjectionKey<SurfContextValue> = Symbol('surf');

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
 * Creates a single WebSocket connection shared via Vue's provide/inject.
 * Auto-reconnects with exponential backoff (1s → 2s → 4s → 8s → max 30s).
 */
export const SurfProvider = defineComponent({
  name: 'SurfProvider',
  props: {
    url: { type: String, required: true },
    auth: { type: String, default: undefined },
    channels: { type: Array as PropType<string[]>, default: undefined },
    endpoint: { type: String, default: undefined },
  },
  setup(props, { slots }) {
    const status = ref<ConnectionStatus>('disconnected');
    const sessionId = ref<string | undefined>();
    const subscribedChannels = ref<ReadonlySet<string>>(new Set());

    let ws: WebSocket | null = null;
    const pending = new Map<string, PendingRequest>();
    const listeners = new Map<string, Set<EventCallback>>();
    let msgCounter = 0;
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let mounted = true;
    const dynamicChannels = new Set<string>(props.channels ?? []);

    function sendRaw(data: unknown) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
      }
    }

    function connect() {
      if (!mounted) return;

      status.value = 'connecting';
      const socket = new WebSocket(props.url);
      ws = socket;

      socket.onopen = () => {
        if (!mounted) { socket.close(); return; }
        reconnectAttempt = 0;
        status.value = 'connected';

        if (props.auth) {
          socket.send(JSON.stringify({ type: 'auth', token: props.auth }));
        }

        const allChannels = new Set([
          ...(props.channels ?? []),
          ...dynamicChannels,
        ]);
        if (allChannels.size > 0) {
          socket.send(JSON.stringify({ type: 'subscribe', channels: [...allChannels] }));
          subscribedChannels.value = allChannels;
          for (const ch of allChannels) dynamicChannels.add(ch);
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
            if (msg.id === 'session' && msg.ok && msg.result) {
              const res = msg.result;
              if (
                typeof res === 'object' &&
                res !== null &&
                'sessionId' in res &&
                typeof (res as Record<string, unknown>)['sessionId'] === 'string'
              ) {
                sessionId.value = (res as { sessionId: string }).sessionId;
              }
            }
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

        if (!mounted) {
          status.value = 'disconnected';
          return;
        }

        status.value = 'reconnecting';
        const attempt = reconnectAttempt++;
        const delay = Math.min(1000 * Math.pow(2, attempt), MAX_RECONNECT_DELAY);
        reconnectTimer = setTimeout(connect, delay);
      };

      socket.onerror = () => {
        // onclose will fire after onerror
      };
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
      const next = new Set(subscribedChannels.value);
      next.add(channelId);
      subscribedChannels.value = next;
    }

    function unsubscribeChannel(channelId: string) {
      sendRaw({ type: 'unsubscribe', channels: [channelId] });
      dynamicChannels.delete(channelId);
      const next = new Set(subscribedChannels.value);
      next.delete(channelId);
      subscribedChannels.value = next;
    }

    const connected = computed(() => status.value === 'connected');

    const contextValue: SurfContextValue = {
      execute,
      status,
      connected,
      sessionId,
      subscribe,
      subscribeChannel,
      unsubscribeChannel,
      channels: subscribedChannels,
    };

    provide(SURF_INJECTION_KEY, contextValue);

    // Register window.surf with WS-backed server executor
    let cleanupExecutor: (() => void) | null = null;
    let statusInterval: ReturnType<typeof setInterval> | null = null;

    function setupWindowSurf() {
      if (typeof window === 'undefined') return;

      ensureSurf();

      if (props.endpoint) {
        setManifestUrl(`${props.endpoint.replace(/\/$/, '')}/.well-known/surf.json`);
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

      setServerStatus(statusMap[status.value] ?? 'disconnected');

      statusInterval = setInterval(() => {
        setServerStatus(statusMap[status.value] ?? 'disconnected');
      }, 500);
    }

    onMounted(() => {
      connect();
      setupWindowSurf();
    });

    onUnmounted(() => {
      mounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (statusInterval) clearInterval(statusInterval);
      if (cleanupExecutor) cleanupExecutor();
      setServerStatus('disconnected');
      ws?.close();
      ws = null;
    });

    return () => slots.default?.();
  },
});
