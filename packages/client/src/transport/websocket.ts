import type { WsIncomingMessage, WsResultMessage, WsEventMessage, SurfResponse } from '../types.js';

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
}

const WS_OPEN = 1;

/**
 * WebSocket transport for real-time Surf command execution and event streaming.
 */
export class WebSocketTransport {
  private ws: WebSocketLike | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly eventListeners = new Map<string, Set<EventCallback>>();
  private msgCounter = 0;
  private sessionId?: string;

  /**
   * Connect to a Surf WebSocket endpoint.
   */
  async connect(url: string, auth?: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
      // Try browser WebSocket first, then Node ws
      const WsConstructor = typeof WebSocket !== 'undefined'
        ? WebSocket
        : await this.getNodeWsAsync();

      if (!WsConstructor) {
        reject(new Error('WebSocket not available. Install "ws" package for Node.js.'));
        return;
      }

      const ws = new WsConstructor(url) as unknown as WebSocketLike;
      this.ws = ws;

      ws.onopen = () => {
        if (auth) {
          ws.send(JSON.stringify({ type: 'auth', token: auth }));
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
        reject(new Error(`WebSocket error: ${String(ev)}`));
      };

      ws.onclose = () => {
        // Reject all pending requests
        for (const [, pending] of this.pending) {
          pending.reject(new Error('WebSocket closed'));
        }
        this.pending.clear();
        this.ws = null;
      };
    });
  }

  /**
   * Execute a command over WebSocket.
   */
  execute(
    command: string,
    params?: Record<string, unknown>,
  ): Promise<SurfResponse> {
    if (!this.ws || this.ws.readyState !== WS_OPEN) {
      return Promise.reject(new Error('WebSocket not connected'));
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
      throw new Error('WebSocket not connected');
    }

    return new Promise((resolve, reject) => {
      const id = 'session';
      this.pending.set(id, {
        resolve: (response) => {
          if (response.ok) {
            const result = response.result as { sessionId: string };
            this.sessionId = result.sessionId;
            resolve(result.sessionId);
          } else {
            reject(new Error('Failed to start session'));
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
   * Close the WebSocket connection.
   */
  close(): void {
    this.ws?.close();
    this.ws = null;
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
