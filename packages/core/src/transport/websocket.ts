import type { WsIncomingMessage, WsOutgoingMessage, WsEventMessage, SurfResponse, LiveConfig } from '../types.js';
import type { CommandRegistry } from '../commands.js';
import type { InMemorySessionStore } from '../session.js';
import type { EventBus } from '../events.js';

interface WsTransportOptions {
  registry: CommandRegistry;
  sessions: InMemorySessionStore;
  events: EventBus;
  live?: LiveConfig;
  /** Get last known state for initial delivery on channel subscribe. */
  getChannelState?: (channelId: string) => { state: unknown; version: number } | undefined;
  /** Interval for ping keepalive in ms. Default: 30000 */
  pingInterval?: number;
  /** Timeout for pong response in ms. Default: 10000 */
  pongTimeout?: number;
}

interface WebSocketLike {
  on(event: 'message', cb: (data: Buffer | string) => void): void;
  on(event: 'close', cb: () => void): void;
  on(event: 'error', cb: (err: Error) => void): void;
  on(event: 'pong', cb: () => void): void;
  send(data: string): void;
  ping(data?: unknown, mask?: boolean, cb?: (err: Error) => void): void;
  terminate(): void;
  close(): void;
  readyState: number;
}

interface WebSocketServerLike {
  on(event: 'connection', cb: (ws: WebSocketLike) => void): void;
  clients?: Set<WebSocketLike>;
}

// ws library constants
const WS_OPEN = 1;

/** Handle returned from attachWebSocket for graceful shutdown. */
export interface WebSocketHandle {
  /** Gracefully close all connections and stop ping intervals. */
  close(): void;
}

/**
 * Attach Surf WebSocket handling to a ws WebSocketServer.
 *
 * Each connection gets its own session and session-scoped event subscriptions.
 * Events are isolated by default — Agent A's events won't leak to Agent B.
 *
 * Event scoping:
 * - `scope: 'session'` (default) — only delivered to the session that triggered it
 * - `scope: 'global'` — delivered to all connected clients (e.g. maintenance mode)
 * - `scope: 'broadcast'` — delivered to all connected clients
 *
 * Clients can also explicitly subscribe to specific events via `{ type: 'subscribe', events: [...] }`.
 */
export function attachWebSocket(
  wss: WebSocketServerLike,
  options: WsTransportOptions,
): WebSocketHandle {
  const { registry, sessions, events, live } = options;
  const liveEnabled = live?.enabled === true;
  const maxChannels = live?.maxChannelsPerConnection ?? 10;
  const pingIntervalMs = options.pingInterval ?? 30000;
  const pongTimeoutMs = options.pongTimeout ?? 10000;

  // Track all active connections for graceful shutdown
  const activeConnections = new Set<WebSocketLike>();
  const aliveFlags = new Map<WebSocketLike, boolean>();
  let closed = false;

  // Periodic ping to detect dead clients
  const heartbeatInterval = pingIntervalMs > 0 ? setInterval(() => {
    for (const ws of activeConnections) {
      if (aliveFlags.get(ws) === false) {
        // No pong received since last ping — terminate
        ws.terminate();
        continue;
      }
      aliveFlags.set(ws, false);
      if (ws.readyState === WS_OPEN) {
        ws.ping();
      }
    }
  }, pingIntervalMs) : null;

  wss.on('connection', (ws) => {
    if (closed) {
      ws.close();
      return;
    }

    activeConnections.add(ws);
    aliveFlags.set(ws, true);

    // Track pong responses for keepalive
    ws.on('pong', () => {
      aliveFlags.set(ws, true);
    });

    let authToken: string | undefined;
    let sessionId: string | undefined;
    const unsubscribes: Array<() => void> = [];
    const subscribedChannels = new Set<string>();
    const channelUnsubscribes = new Map<string, () => void>();

    // Subscribe to events — but scoped to this connection's session
    function subscribeToEvents(): void {
      // Clean up old subscriptions first
      for (const unsub of unsubscribes) {
        unsub();
      }
      unsubscribes.length = 0;

      for (const [eventName] of events.getDefinitions()) {
        const unsub = events.on(
          eventName,
          (data) => {
            if (ws.readyState !== WS_OPEN) return;
            const msg: WsEventMessage = { type: 'event', event: eventName, data };
            ws.send(JSON.stringify(msg));
          },
          sessionId, // Session-scoped: only receive events for this session
        );
        unsubscribes.push(unsub);
      }
    }

    // Initial subscription (no session yet — will only get global/broadcast events)
    subscribeToEvents();

    ws.on('message', async (raw) => {
      // Any message counts as activity
      aliveFlags.set(ws, true);

      let msg: WsIncomingMessage;
      try {
        msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf-8')) as WsIncomingMessage;
      } catch {
        return; // Ignore malformed messages
      }

      switch (msg.type) {
        case 'auth': {
          authToken = msg.token;
          break;
        }

        case 'session': {
          if (msg.action === 'start') {
            const session = await sessions.create();
            sessionId = session.id;

            // Re-subscribe with the new session ID for scoped event delivery
            subscribeToEvents();

            const response: WsOutgoingMessage = {
              type: 'result',
              id: 'session',
              ok: true,
              result: { sessionId: session.id },
            };
            ws.send(JSON.stringify(response));
          } else if (msg.action === 'end' && sessionId) {
            // Clean up session-scoped event listeners
            events.removeSession(sessionId);
            await sessions.destroy(sessionId);
            sessionId = undefined;

            // Re-subscribe without session (only global events)
            subscribeToEvents();
          }
          break;
        }

        case 'subscribe': {
          if (!liveEnabled) break;
          const channels = msg.channels;
          if (!Array.isArray(channels)) break;

          for (const channelId of channels) {
            if (typeof channelId !== 'string') continue;
            if (subscribedChannels.has(channelId)) continue;
            if (subscribedChannels.size >= maxChannels) {
              const errMsg: WsOutgoingMessage = {
                type: 'result',
                id: 'subscribe',
                ok: false,
                error: { code: 'INVALID_PARAMS', message: `Max ${maxChannels} channels per connection` },
              };
              ws.send(JSON.stringify(errMsg));
              break;
            }

            // Channel auth check — fail-closed: auth always required unless channelAuth explicitly returns true
            if (!authToken) {
              const errMsg: WsOutgoingMessage = {
                type: 'result',
                id: 'subscribe',
                ok: false,
                error: { code: 'AUTH_REQUIRED', message: 'Auth token required for channel subscription' },
              };
              ws.send(JSON.stringify(errMsg));
              continue;
            }
            if (live?.channelAuth) {
              try {
                const allowed = await live.channelAuth(authToken, channelId);
                if (!allowed) continue;
              } catch {
                // channelAuth threw — fail-closed, deny subscription
                continue;
              }
            }

            subscribedChannels.add(channelId);

            // Listen for ALL channel-scoped events (state, patch, and custom)
            const channelEvents = ['surf:state', 'surf:patch'];
            // Also subscribe to any user-defined events
            for (const [eventName] of events.getDefinitions()) {
              if (!channelEvents.includes(eventName)) channelEvents.push(eventName);
            }

            const eventUnsubs: Array<() => void> = [];
            for (const eventName of channelEvents) {
              const unsub = events.on(
                eventName,
                (data) => {
                  if (ws.readyState !== WS_OPEN) return;
                  const eventMsg: WsEventMessage = { type: 'event', event: eventName, data };
                  ws.send(JSON.stringify(eventMsg));
                },
                { channelId },
              );
              eventUnsubs.push(unsub);
            }

            // Also listen for dynamically emitted channel events (catch-all)
            const customUnsub = events.onChannel(channelId, (eventName, data) => {
              if (ws.readyState !== WS_OPEN) return;
              if (channelEvents.includes(eventName)) return; // already handled
              const eventMsg: WsEventMessage = { type: 'event', event: eventName, data };
              ws.send(JSON.stringify(eventMsg));
            });
            eventUnsubs.push(customUnsub);

            channelUnsubscribes.set(channelId, () => {
              for (const unsub of eventUnsubs) unsub();
            });

            // Deliver initial state if available
            if (options.getChannelState) {
              const initial = options.getChannelState(channelId);
              if (initial && ws.readyState === WS_OPEN) {
                const initMsg: WsEventMessage = {
                  type: 'event',
                  event: 'surf:state',
                  data: { channel: channelId, state: initial.state, version: initial.version },
                };
                ws.send(JSON.stringify(initMsg));
              }
            }
          }
          break;
        }

        case 'unsubscribe': {
          if (!liveEnabled) break;
          const channels = msg.channels;
          if (!Array.isArray(channels)) break;

          for (const channelId of channels) {
            if (typeof channelId !== 'string') continue;
            subscribedChannels.delete(channelId);
            const unsub = channelUnsubscribes.get(channelId);
            if (unsub) {
              unsub();
              channelUnsubscribes.delete(channelId);
            }
          }
          break;
        }

        case 'execute': {
          const effectiveSessionId = msg.sessionId ?? sessionId;
          let sessionState: Record<string, unknown> | undefined;

          if (effectiveSessionId) {
            const session = await sessions.get(effectiveSessionId);
            if (session) {
              sessionState = session.state;
            }
          }

          const response: SurfResponse = await registry.execute(
            msg.command,
            msg.params,
            {
              sessionId: effectiveSessionId,
              auth: authToken,
              state: sessionState,
              requestId: msg.id,
              // Session-scoped emit: events fired by this command
              // are tagged with the session that triggered them
              emit: (data: unknown) => {
                events.emit(`command.${msg.command}`, data, effectiveSessionId);
              },
            },
          );

          // Update session state
          if (effectiveSessionId && response.ok && response.state) {
            await sessions.update(effectiveSessionId, response.state);
          }

          const wsResponse: WsOutgoingMessage = {
            type: 'result',
            id: msg.id,
            ok: response.ok,
            ...(response.ok ? { result: response.result, state: response.state } : {}),
            ...(!response.ok ? { error: response.error } : {}),
          };

          ws.send(JSON.stringify(wsResponse));
          break;
        }
      }
    });

    function cleanup(): void {
      activeConnections.delete(ws);
      aliveFlags.delete(ws);
      // Clean up all event subscriptions for this connection
      for (const unsub of unsubscribes) {
        unsub();
      }
      // Clean up channel subscriptions
      for (const unsub of channelUnsubscribes.values()) {
        unsub();
      }
      channelUnsubscribes.clear();
      subscribedChannels.clear();
      // Also clean up any session-scoped listeners
      if (sessionId) {
        events.removeSession(sessionId);
      }
    }

    ws.on('close', cleanup);
    ws.on('error', cleanup);
  });

  return {
    close(): void {
      closed = true;
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
      // Gracefully close all active connections
      for (const ws of activeConnections) {
        ws.close();
      }
      activeConnections.clear();
      aliveFlags.clear();
    },
  };
}
