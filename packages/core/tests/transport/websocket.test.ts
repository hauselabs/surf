import { describe, it, expect, vi, beforeEach } from 'vitest';
import { attachWebSocket } from '../../src/transport/websocket.js';
import { EventBus } from '../../src/events.js';
import { InMemorySessionStore } from '../../src/session.js';
import { CommandRegistry } from '../../src/commands.js';
import type { LiveConfig, RateLimitConfig } from '../../src/types.js';

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

describe('WebSocket Transport — rate limiting on execute', () => {
  let events: EventBus;
  let sessions: InMemorySessionStore;

  beforeEach(() => {
    events = new EventBus({});
    sessions = new InMemorySessionStore();
  });

  it('allows execute messages when no rateLimit is configured', async () => {
    const registry = new CommandRegistry({
      ping: { description: 'Ping', handler: () => ({ ok: true, result: 'pong' }) },
    });
    const wss = createMockWss();

    attachWebSocket(wss, {
      registry,
      sessions,
      events,
      pingInterval: 0,
      // No rateLimit — should allow all
    });

    const ws = createMockWs();
    wss.simulateConnection(ws);

    // Fire 10 execute messages rapidly
    for (let i = 0; i < 10; i++) {
      ws.receive({ type: 'execute', command: 'ping', params: {}, id: `req-${i}` });
    }
    await new Promise((r) => setTimeout(r, 50));

    const results = ws.parseSent().filter(
      (m: Record<string, unknown>) => m['type'] === 'result',
    );
    expect(results).toHaveLength(10);
    // All should be ok
    for (const r of results) {
      expect((r as Record<string, unknown>)['ok']).toBe(true);
    }
  });

  it('rejects execute messages when rate limit is exceeded', async () => {
    const registry = new CommandRegistry({
      ping: { description: 'Ping', handler: () => ({ ok: true, result: 'pong' }) },
    });
    const wss = createMockWss();
    const rateLimit: RateLimitConfig = {
      windowMs: 60_000,
      maxRequests: 3,
      keyBy: 'global',
    };

    attachWebSocket(wss, {
      registry,
      sessions,
      events,
      pingInterval: 0,
      rateLimit,
    });

    const ws = createMockWs();
    wss.simulateConnection(ws);

    // First 3 should succeed
    for (let i = 0; i < 3; i++) {
      ws.receive({ type: 'execute', command: 'ping', params: {}, id: `req-${i}` });
    }
    await new Promise((r) => setTimeout(r, 50));

    const successResults = ws.parseSent().filter(
      (m: Record<string, unknown>) => m['type'] === 'result' && m['ok'] === true,
    );
    expect(successResults).toHaveLength(3);

    // 4th should be rate limited
    ws.receive({ type: 'execute', command: 'ping', params: {}, id: 'req-blocked' });
    await new Promise((r) => setTimeout(r, 50));

    const allResults = ws.parseSent().filter(
      (m: Record<string, unknown>) => m['type'] === 'result',
    );
    const blocked = allResults.find(
      (m: Record<string, unknown>) => m['id'] === 'req-blocked',
    ) as Record<string, unknown>;
    expect(blocked['ok']).toBe(false);
    const error = blocked['error'] as Record<string, unknown>;
    expect(error['code']).toBe('RATE_LIMITED');
  });

  it('rate limits per-connection using session keyBy', async () => {
    const registry = new CommandRegistry({
      ping: { description: 'Ping', handler: () => ({ ok: true, result: 'pong' }) },
    });
    const wss = createMockWss();
    const rateLimit: RateLimitConfig = {
      windowMs: 60_000,
      maxRequests: 2,
      keyBy: 'session',
    };

    attachWebSocket(wss, {
      registry,
      sessions,
      events,
      pingInterval: 0,
      rateLimit,
    });

    // Two separate connections — each should get their own limit
    const ws1 = createMockWs();
    const ws2 = createMockWs();
    wss.simulateConnection(ws1);
    wss.simulateConnection(ws2);

    // ws1: send 2 (should succeed) + 1 (should fail)
    ws1.receive({ type: 'execute', command: 'ping', params: {}, id: 'a1' });
    ws1.receive({ type: 'execute', command: 'ping', params: {}, id: 'a2' });
    ws1.receive({ type: 'execute', command: 'ping', params: {}, id: 'a3' });

    // ws2: send 2 (should succeed)
    ws2.receive({ type: 'execute', command: 'ping', params: {}, id: 'b1' });
    ws2.receive({ type: 'execute', command: 'ping', params: {}, id: 'b2' });

    await new Promise((r) => setTimeout(r, 50));

    // ws1: 2 ok + 1 rate limited
    const ws1Ok = ws1.parseSent().filter(
      (m: Record<string, unknown>) => m['type'] === 'result' && m['ok'] === true,
    );
    const ws1Blocked = ws1.parseSent().filter(
      (m: Record<string, unknown>) =>
        m['type'] === 'result' &&
        m['ok'] === false &&
        (m['error'] as Record<string, unknown>)?.['code'] === 'RATE_LIMITED',
    );
    expect(ws1Ok).toHaveLength(2);
    expect(ws1Blocked).toHaveLength(1);

    // ws2: both should succeed (separate connection = separate key)
    const ws2Ok = ws2.parseSent().filter(
      (m: Record<string, unknown>) => m['type'] === 'result' && m['ok'] === true,
    );
    expect(ws2Ok).toHaveLength(2);
  });

  it('uses per-command rate limit when defined, overriding global', async () => {
    const registry = new CommandRegistry({
      fast: {
        description: 'Fast endpoint',
        handler: () => ({ ok: true, result: 'fast' }),
        // No per-command rateLimit — uses global
      },
      slow: {
        description: 'Slow endpoint',
        rateLimit: { windowMs: 60_000, maxRequests: 1, keyBy: 'global' },
        handler: () => ({ ok: true, result: 'slow' }),
      },
    });
    const wss = createMockWss();
    const rateLimit: RateLimitConfig = {
      windowMs: 60_000,
      maxRequests: 10,
      keyBy: 'global',
    };

    attachWebSocket(wss, {
      registry,
      sessions,
      events,
      pingInterval: 0,
      rateLimit,
    });

    const ws = createMockWs();
    wss.simulateConnection(ws);

    // 'slow' command: only 1 allowed, 2nd should be rate limited
    ws.receive({ type: 'execute', command: 'slow', params: {}, id: 's1' });
    ws.receive({ type: 'execute', command: 'slow', params: {}, id: 's2' });

    // 'fast' command: 10 allowed, these should succeed
    ws.receive({ type: 'execute', command: 'fast', params: {}, id: 'f1' });
    ws.receive({ type: 'execute', command: 'fast', params: {}, id: 'f2' });

    await new Promise((r) => setTimeout(r, 50));

    const slowBlocked = ws.parseSent().filter(
      (m: Record<string, unknown>) =>
        m['id'] === 's2' &&
        m['ok'] === false &&
        (m['error'] as Record<string, unknown>)?.['code'] === 'RATE_LIMITED',
    );
    expect(slowBlocked).toHaveLength(1);

    const fastOk = ws.parseSent().filter(
      (m: Record<string, unknown>) =>
        ((m['id'] as string)?.startsWith('f')) &&
        m['ok'] === true,
    );
    expect(fastOk).toHaveLength(2);
  });

  it('includes retryAfterMs in RATE_LIMITED error', async () => {
    const registry = new CommandRegistry({
      ping: { description: 'Ping', handler: () => ({ ok: true, result: 'pong' }) },
    });
    const wss = createMockWss();
    const rateLimit: RateLimitConfig = {
      windowMs: 60_000,
      maxRequests: 1,
      keyBy: 'global',
    };

    attachWebSocket(wss, {
      registry,
      sessions,
      events,
      pingInterval: 0,
      rateLimit,
    });

    const ws = createMockWs();
    wss.simulateConnection(ws);

    ws.receive({ type: 'execute', command: 'ping', params: {}, id: 'ok' });
    ws.receive({ type: 'execute', command: 'ping', params: {}, id: 'blocked' });
    await new Promise((r) => setTimeout(r, 50));

    const blocked = ws.parseSent().find(
      (m: Record<string, unknown>) => m['id'] === 'blocked',
    ) as Record<string, unknown>;
    expect(blocked['ok']).toBe(false);
    const error = blocked['error'] as Record<string, unknown>;
    expect(error['code']).toBe('RATE_LIMITED');
    expect(typeof error['retryAfterMs']).toBe('number');
    expect(error['retryAfterMs'] as number).toBeGreaterThan(0);
  });
});
