import type { WsIncomingMessage, WsResultMessage, WsEventMessage, SurfResponse } from '../types.js';
import { SurfClientError } from '../client.js';

/** Type guard: verify that an unknown value has a `sessionId` string property. */
function isSessionResult(value: unknown): value is { sessionId: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'sessionId' in value &&
    typeof (value as Record<string, unknown>)['sessionId'] === 'string'
  );
}

type EventCallback = (data: unknown) => void;

interface PendingRequest {
  resolve: (response: SurfResponse) => void;
  reject: (error: Error) => void;
}

interface WebSocketLike {
  send(data: string): void;
  close(): void;
  readyState: number;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: string | Buffer }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  ping?: (data?: unknown, mask?: boolean, cb?: (err: Error) => void) => void;
}

const WS_OPEN = 1;

/** Connection state for the WebSocket transport. */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/** Options for configuring reconnection and health monitoring. */
export interface WebSocketTransportOptions {
  /** Enable auto-reconnect on disconnect. Default: true */
  reconnect?: boolean;
  /** Maximum number of reconnect attempts. Default: Infinity */
  maxReconnectAttempts?: number;
  /** Initial reconnect delay in ms. Default: 1000 */
  reconnectDelay?: number;
  /** Maximum reconnect delay in ms. Default: 16000 */
  maxReconnectDelay?: number;
  /** Interval for ping keepalive in ms. Default: 30000 */
  pingInterval?: number;
  /** Called when connection is lost. */
  onDisconnect?: () => void;
  /** Called when connection is re-established after a disconnect. */
  onReconnect?: () => void;
  /** Called when connection state changes. */
  onStateChange?: (state: ConnectionState) => void;
}

/**
 * WebSocket transport for real-time Surf command execution and event streaming.
 */
export class WebSocketTransport {
  private ws: WebSocketLike | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly eventListeners = new Map<string, Set<EventCallback>>();
  private msgCounter = 0;
  private sessionId?: string;

  // Reconnection state
  private _state: ConnectionState = 'disconnected';
  private connectUrl?: string;
  private connectAuth?: string;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private intentionalClose = false;

  private readonly opts: Required<Omit<WebSocketTransportOptions, 'onDisconnect' | 'onReconnect' | 'onStateChange'>> & Pick<WebSocketTransportOptions, 'onDisconnect' | 'onReconnect' | 'onStateChange'>;

  constructor(options?: WebSocketTransportOptions) {
    this.opts = {
      reconnect: options?.reconnect ?? true,
      maxReconnectAttempts: options?.maxReconnectAttempts ?? Infinity,
      reconnectDelay: options?.reconnectDelay ?? 1000,
      maxReconnectDelay: options?.maxReconnectDelay ?? 16000,
      pingInterval: options?.pingInterval ?? 30000,
      onDisconnect: options?.onDisconnect,
      onReconnect: options?.onReconnect,
      onStateChange: options?.onStateChange,
    };
  }

  /** Current connection state. */
  get state(): ConnectionState {
    return this._state;
  }

  private setState(state: ConnectionState): void {
    if (this._state === state) return;
    this._state = state;
    this.opts.onStateChange?.(state);
  }

  /**
   * Connect to a Surf WebSocket endpoint.
   */
  async connect(url: string, auth?: string): Promise<void> {
    this.connectUrl = url;
    this.connectAuth = auth;
    this.intentionalClose = false;
    this.setState('connecting');

    return this.doConnect(url, auth);
  }

  private async doConnect(url: string, auth?: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
      // Try browser WebSocket first, then Node ws
      const WsConstructor = typeof WebSocket !== 'undefined'
        ? WebSocket
        : await this.getNodeWsAsync();

      if (!WsConstructor) {
        this.setState('disconnected');
        reject(new SurfClientError(
          'WebSocket not available. Install "ws" package for Node.js.',
          'NOT_SUPPORTED',
        ));
        return;
      }

      const ws = new WsConstructor(url) as unknown as WebSocketLike;
      this.ws = ws;

      ws.onopen = () => {
        const wasReconnecting = this._state === 'reconnecting';
        this.setState('connected');
        this.reconnectAttempts = 0;
        this.startPing();

        if (auth) {
          ws.send(JSON.stringify({ type: 'auth', token: auth }));
        }

        if (wasReconnecting) {
          this.opts.onReconnect?.();
        }

        resolve();
      };

      ws.onmessage = (ev) => {
        const raw = typeof ev.data === 'string' ? ev.data : ev.data.toString('utf-8');
        let msg: WsIncomingMessage;
        try {
          msg = JSON.parse(raw) as WsIncomingMessage;
        } catch {
          return;
        }

        if (msg.type === 'result') {
          this.handleResult(msg);
        } else if (msg.type === 'event') {
          this.handleEvent(msg);
        }
      };

      ws.onerror = (ev) => {
        // Only reject if this is the initial connection attempt
        if (this._state === 'connecting') {
          this.setState('disconnected');
          reject(new SurfClientError(
            `WebSocket connection failed: ${String(ev)}`,
            'NETWORK_ERROR',
          ));
        }
      };

      ws.onclose = () => {
        this.stopPing();

        // Reject all pending requests
        for (const [, pending] of this.pending) {
          pending.reject(new SurfClientError('WebSocket connection closed', 'NETWORK_ERROR'));
        }
        this.pending.clear();
        this.ws = null;

        if (this.intentionalClose) {
          this.setState('disconnected');
          return;
        }

        const wasConnected = this._state === 'connected' || this._state === 'reconnecting';
        if (wasConnected) {
          this.opts.onDisconnect?.();
        }

        this.setState('disconnected');

        // Attempt reconnection
        if (this.opts.reconnect && this.connectUrl && !this.intentionalClose) {
          this.scheduleReconnect();
        }
      };
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.opts.maxReconnectAttempts) return;

    const delay = Math.min(
      this.opts.reconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.opts.maxReconnectDelay,
    );
    this.reconnectAttempts++;
    this.setState('reconnecting');

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.intentionalClose || !this.connectUrl) return;

      try {
        await this.doConnect(this.connectUrl, this.connectAuth);
      } catch {
        // doConnect failed, onclose will trigger another reconnect attempt
      }
    }, delay);
  }

  private startPing(): void {
    this.stopPing();
    if (this.opts.pingInterval <= 0) return;

    this.pingTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WS_OPEN) return;

      // Use ws library's built-in ping if available (Node.js),
      // otherwise send a JSON ping message
      if (typeof this.ws.ping === 'function') {
        this.ws.ping();
      } else {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, this.opts.pingInterval);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /**
   * Execute a command over WebSocket.
   */
  execute(
    command: string,
    params?: Record<string, unknown>,
  ): Promise<SurfResponse> {
    if (!this.ws || this.ws.readyState !== WS_OPEN) {
      return Promise.reject(new SurfClientError(
        'WebSocket not connected — call connect() first',
        'NOT_CONNECTED',
      ));
    }

    const id = `msg_${++this.msgCounter}`;

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws!.send(JSON.stringify({
        type: 'execute',
        id,
        command,
        params: params ?? {},
        ...(this.sessionId ? { sessionId: this.sessionId } : {}),
      }));
    });
  }

  /**
   * Subscribe to a Surf event. Returns unsubscribe function.
   */
  on(event: string, callback: EventCallback): () => void {
    let set = this.eventListeners.get(event);
    if (!set) {
      set = new Set();
      this.eventListeners.set(event, set);
    }
    set.add(callback);
    return () => set.delete(callback);
  }

  /**
   * Start a session over WebSocket.
   */
  async startSession(): Promise<string> {
    if (!this.ws || this.ws.readyState !== WS_OPEN) {
      throw new SurfClientError(
        'WebSocket not connected — call connect() first',
        'NOT_CONNECTED',
      );
    }

    return new Promise((resolve, reject) => {
      const id = 'session';
      this.pending.set(id, {
        resolve: (response) => {
          if (response.ok && isSessionResult(response.result)) {
            this.sessionId = response.result.sessionId;
            resolve(response.result.sessionId);
          } else if (!response.ok) {
            reject(new SurfClientError(
              response.error?.message ?? 'Failed to start session',
              response.error?.code ?? 'NETWORK_ERROR',
            ));
          } else {
            reject(new SurfClientError(
              'Failed to start session: unexpected response shape',
              'NETWORK_ERROR',
            ));
          }
        },
        reject,
      });

      this.ws!.send(JSON.stringify({ type: 'session', action: 'start' }));
    });
  }

  /**
   * End the current session.
   */
  async endSession(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WS_OPEN) return;
    if (this.sessionId) {
      this.ws.send(JSON.stringify({
        type: 'session',
        action: 'end',
        sessionId: this.sessionId,
      }));
      this.sessionId = undefined;
    }
  }

  /**
   * Close the WebSocket connection. Stops reconnection.
   */
  close(): void {
    this.intentionalClose = true;
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.setState('disconnected');
  }

  get connected(): boolean {
    return this.ws !== null && this.ws.readyState === WS_OPEN;
  }

  private handleResult(msg: WsResultMessage): void {
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    this.pending.delete(msg.id);

    if (msg.ok) {
      pending.resolve({
        ok: true,
        result: msg.result,
        state: msg.state,
      });
    } else {
      pending.resolve({
        ok: false,
        error: msg.error ?? { code: 'INTERNAL_ERROR', message: 'Unknown error' },
      });
    }
  }

  private handleEvent(msg: WsEventMessage): void {
    const set = this.eventListeners.get(msg.event);
    if (!set) return;
    for (const cb of set) {
      try {
        cb(msg.data);
      } catch {
        // Swallow listener errors
      }
    }
  }

  private async getNodeWsAsync(): Promise<(new (url: string) => WebSocketLike) | null> {
    try {
      const mod = await import('ws');
      const WsCtor = (mod.default ?? mod) as unknown as new (url: string) => WebSocketLike;
      return WsCtor;
    } catch {
      return null;
    }
  }
}
