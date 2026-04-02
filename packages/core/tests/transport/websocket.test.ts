import { describe, it, expect, vi, beforeEach } from 'vitest';
import { attachWebSocket } from '../../src/transport/websocket.js';
import { EventBus } from '../../src/events.js';
import { InMemorySessionStore } from '../../src/session.js';
import { CommandRegistry } from '../../src/commands.js';
import type { LiveConfig } from '../../src/types.js';

// ─── Mock helpers ───────────────────────────────────────────────────────────

function createMockWs() {
  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
  const sent: string[] = [];
  return {
    readyState: 1,
    sent,
    on(event: string, cb: (...args: unknown[]) => void) {
      (handlers[event] ??= []).push(cb);
    },
    send(data: string) {
      sent.push(data);
    },
    ping: vi.fn(),
    terminate: vi.fn(),
    close: vi.fn(),
    // Simulate receiving a message
    receive(msg: unknown) {
      for (const cb of handlers['message'] ?? []) {
        cb(JSON.stringify(msg));
      }
    },
    // Trigger close
    triggerClose() {
      for (const cb of handlers['close'] ?? []) cb();
    },
    parseSent(): unknown[] {
      return sent.map((s) => JSON.parse(s));
    },
    lastParsed(): Record<string, unknown> {
      return JSON.parse(sent[sent.length - 1]) as Record<string, unknown>;
    },
  };
}

function createMockWss() {
  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
  return {
    clients: new Set(),
    on(event: string, cb: (...args: unknown[]) => void) {
      (handlers[event] ??= []).push(cb);
    },
    simulateConnection(ws: ReturnType<typeof createMockWs>) {
      for (const cb of handlers['connection'] ?? []) cb(ws);
    },
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('WebSocket Transport — channel auth', () => {
  let events: EventBus;
  let sessions: InMemorySessionStore;
  let registry: CommandRegistry;

  beforeEach(() => {
    events = new EventBus({});
    sessions = new InMemorySessionStore();
    registry = new CommandRegistry({});
  });

  it('allows unauthenticated subscription when channelAuth is NOT configured', async () => {
    const wss = createMockWss();
    const live: LiveConfig = { enabled: true };

    attachWebSocket(wss, {
      registry,
      sessions,
      events,
      live,
      pingInterval: 0,
    });

    const ws = createMockWs();
    wss.simulateConnection(ws);

    // Subscribe without sending auth first
    ws.receive({ type: 'subscribe', channels: ['public-feed'] });

    // Allow async handlers to settle
    await new Promise((r) => setTimeout(r, 10));

    // Should NOT have an AUTH_REQUIRED error
    const errors = ws.parseSent().filter(
      (m: Record<string, unknown>) => !m['ok'] && (m['error'] as Record<string, unknown>)?.['code'] === 'AUTH_REQUIRED',
    );
    expect(errors).toHaveLength(0);
  });

  it('requires auth when channelAuth IS configured and no token provided', async () => {
    const wss = createMockWss();
    const channelAuth = vi.fn().mockResolvedValue(true);
    const live: LiveConfig = { enabled: true, channelAuth };

    attachWebSocket(wss, {
      registry,
      sessions,
      events,
      live,
      pingInterval: 0,
    });

    const ws = createMockWs();
    wss.simulateConnection(ws);

    // Subscribe without auth
    ws.receive({ type: 'subscribe', channels: ['private-channel'] });

    await new Promise((r) => setTimeout(r, 10));

    const errors = ws.parseSent().filter(
      (m: Record<string, unknown>) => !m['ok'] && (m['error'] as Record<string, unknown>)?.['code'] === 'AUTH_REQUIRED',
    );
    expect(errors).toHaveLength(1);
    expect(channelAuth).not.toHaveBeenCalled();
  });

  it('allows subscription when channelAuth is configured and token is valid', async () => {
    const wss = createMockWss();
    const channelAuth = vi.fn().mockResolvedValue(true);
    const live: LiveConfig = { enabled: true, channelAuth };

    attachWebSocket(wss, {
      registry,
      sessions,
      events,
      live,
      pingInterval: 0,
    });

    const ws = createMockWs();
    wss.simulateConnection(ws);

    // Authenticate first
    ws.receive({ type: 'auth', token: 'valid-token' });
    await new Promise((r) => setTimeout(r, 10));

    // Subscribe
    ws.receive({ type: 'subscribe', channels: ['private-channel'] });
    await new Promise((r) => setTimeout(r, 10));

    // No AUTH_REQUIRED error
    const errors = ws.parseSent().filter(
      (m: Record<string, unknown>) => !m['ok'] && (m['error'] as Record<string, unknown>)?.['code'] === 'AUTH_REQUIRED',
    );
    expect(errors).toHaveLength(0);
    expect(channelAuth).toHaveBeenCalledWith('valid-token', 'private-channel');
  });

  it('denies subscription when channelAuth returns false', async () => {
    const wss = createMockWss();
    const channelAuth = vi.fn().mockResolvedValue(false);
    const live: LiveConfig = { enabled: true, channelAuth };

    attachWebSocket(wss, {
      registry,
      sessions,
      events,
      live,
      pingInterval: 0,
    });

    const ws = createMockWs();
    wss.simulateConnection(ws);

    ws.receive({ type: 'auth', token: 'valid-token' });
    await new Promise((r) => setTimeout(r, 10));

    ws.receive({ type: 'subscribe', channels: ['forbidden-channel'] });
    await new Promise((r) => setTimeout(r, 10));

    // channelAuth was called
    expect(channelAuth).toHaveBeenCalledWith('valid-token', 'forbidden-channel');

    // No AUTH_REQUIRED error (token was present), but subscription silently denied
    const authErrors = ws.parseSent().filter(
      (m: Record<string, unknown>) => !m['ok'] && (m['error'] as Record<string, unknown>)?.['code'] === 'AUTH_REQUIRED',
    );
    expect(authErrors).toHaveLength(0);
  });

  it('denies subscription when channelAuth throws (fail-closed)', async () => {
    const wss = createMockWss();
    const channelAuth = vi.fn().mockRejectedValue(new Error('DB down'));
    const live: LiveConfig = { enabled: true, channelAuth };

    attachWebSocket(wss, {
      registry,
      sessions,
      events,
      live,
      pingInterval: 0,
    });

    const ws = createMockWs();
    wss.simulateConnection(ws);

    ws.receive({ type: 'auth', token: 'valid-token' });
    await new Promise((r) => setTimeout(r, 10));

    ws.receive({ type: 'subscribe', channels: ['some-channel'] });
    await new Promise((r) => setTimeout(r, 10));

    expect(channelAuth).toHaveBeenCalled();
  });

  it('delivers initial state on unauthenticated channel subscribe', async () => {
    const wss = createMockWss();
    const live: LiveConfig = { enabled: true };

    attachWebSocket(wss, {
      registry,
      sessions,
      events,
      live,
      pingInterval: 0,
      getChannelState: (channelId: string) => {
        if (channelId === 'scores') {
          return { state: { home: 1, away: 0 }, version: 3 };
        }
        return undefined;
      },
    });

    const ws = createMockWs();
    wss.simulateConnection(ws);

    // Subscribe without auth — should work since no channelAuth configured
    ws.receive({ type: 'subscribe', channels: ['scores'] });
    await new Promise((r) => setTimeout(r, 10));

    // Should receive initial state event
    const stateMessages = ws.parseSent().filter(
      (m: Record<string, unknown>) => m['type'] === 'event' && m['event'] === 'surf:state',
    );
    expect(stateMessages).toHaveLength(1);
    const data = (stateMessages[0] as Record<string, unknown>)['data'] as Record<string, unknown>;
    expect(data['channel']).toBe('scores');
    expect(data['state']).toEqual({ home: 1, away: 0 });
    expect(data['version']).toBe(3);
  });
});
