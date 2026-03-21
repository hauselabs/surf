import type { WsIncomingMessage, WsOutgoingMessage, WsEventMessage, SurfResponse, LiveConfig } from '../types.js';
import type { CommandRegistry } from '../commands.js';
import type { InMemorySessionStore } from '../session.js';
import type { EventBus } from '../events.js';

interface WsTransportOptions {
  registry: CommandRegistry;
  sessions: InMemorySessionStore;
  events: EventBus;
  live?: LiveConfig;
}

interface WebSocketLike {
  on(event: 'message', cb: (data: Buffer | string) => void): void;
  on(event: 'close', cb: () => void): void;
  on(event: 'error', cb: (err: Error) => void): void;
  send(data: string): void;
  readyState: number;
}

interface WebSocketServerLike {
  on(event: 'connection', cb: (ws: WebSocketLike) => void): void;
}

// ws library constants
const WS_OPEN = 1;

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
): void {
  const { registry, sessions, events, live } = options;
  const liveEnabled = live?.enabled === true;
  const maxChannels = live?.maxChannelsPerConnection ?? 10;

  wss.on('connection', (ws) => {
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

            // Channel auth check
            if (live?.channelAuth) {
              if (!authToken) {
                const errMsg: WsOutgoingMessage = {
                  type: 'result',
                  id: 'subscribe',
                  ok: false,
                  error: { code: 'AUTH_REQUIRED', message: 'Auth required for channel subscription' },
                };
                ws.send(JSON.stringify(errMsg));
                continue;
              }
              const allowed = await live.channelAuth(authToken, channelId);
              if (!allowed) continue;
            }

            subscribedChannels.add(channelId);

            // Listen for channel-scoped events
            const unsub = events.on(
              'surf:state',
              (data) => {
                if (ws.readyState !== WS_OPEN) return;
                const eventMsg: WsEventMessage = { type: 'event', event: 'surf:state', data };
                ws.send(JSON.stringify(eventMsg));
              },
              { channelId },
            );
            channelUnsubscribes.set(channelId, unsub);

            // Also listen for patch events
            const unsubPatch = events.on(
              'surf:patch',
              (data) => {
                if (ws.readyState !== WS_OPEN) return;
                const eventMsg: WsEventMessage = { type: 'event', event: 'surf:patch', data };
                ws.send(JSON.stringify(eventMsg));
              },
              { channelId },
            );
            const origUnsub = channelUnsubscribes.get(channelId)!;
            channelUnsubscribes.set(channelId, () => { origUnsub(); unsubPatch(); });
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

    ws.on('close', () => {
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
    });

    ws.on('error', () => {
      for (const unsub of unsubscribes) {
        unsub();
      }
      for (const unsub of channelUnsubscribes.values()) {
        unsub();
      }
      channelUnsubscribes.clear();
      subscribedChannels.clear();
      if (sessionId) {
        events.removeSession(sessionId);
      }
    });
  });
}
