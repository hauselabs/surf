import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { createSurf } from '../src/surf.js';
import { bearerVerifier } from '../src/auth.js';
import { SurfClient, SurfClientError } from '../../client/src/index.js';

const VALID_TOKEN = 'test-secret-token-abc123';

function createTestSurf() {
  return createSurf({
    name: 'E2E-Shop',
    version: '1.0.0',
    description: 'E2E test shop API',
    authVerifier: bearerVerifier([VALID_TOKEN]),
    rateLimit: {
      windowMs: 2000,
      maxRequests: 5,
      keyBy: 'global',
    },
    commands: {
      search: {
        description: 'Search for products',
        params: {
          query: { type: 'string', required: true },
          limit: { type: 'number', default: 10 },
        },
        hints: { idempotent: true, sideEffects: false },
        run: async (p) => ({
          items: [
            { id: 1, name: `${p.query} result 1` },
            { id: 2, name: `${p.query} result 2` },
          ],
          total: 2,
          limit: p.limit,
        }),
      },
      'cart.add': {
        description: 'Add item to cart',
        params: {
          productId: { type: 'number', required: true },
          quantity: { type: 'number', default: 1 },
        },
        hints: { sideEffects: true },
        run: async (p, ctx) => {
          const state = ctx.state ?? {};
          const cart = (state.cart as Array<{ id: number; qty: number }>) ?? [];
          cart.push({ id: p.productId as number, qty: (p.quantity as number) ?? 1 });
          ctx.state = { ...state, cart };
          return { added: p.productId, cartSize: cart.length, cart };
        },
      },
      checkout: {
        description: 'Checkout current cart',
        auth: 'required',
        hints: { sideEffects: true },
        run: async (_p, ctx) => {
          const state = ctx.state ?? {};
          const cart = (state.cart as Array<{ id: number; qty: number }>) ?? [];
          if (cart.length === 0) {
            return { success: false, reason: 'Cart is empty' };
          }
          const orderId = `ORD-${Date.now()}`;
          ctx.state = { ...state, cart: [], lastOrder: orderId };
          return { success: true, orderId, itemCount: cart.length };
        },
      },
      'admin.reset': {
        description: 'Admin reset (auth required)',
        auth: 'required',
        run: async () => ({ reset: true }),
      },
    },
  });
}

describe('E2E: Real HTTP server with @surfjs/client', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const surf = createTestSurf();
    const middleware = surf.middleware();

    server = http.createServer(async (req, res) => {
      try {
        await middleware(req as never, res as never);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: { code: 'INTERNAL_ERROR', message: String(err) } }));
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // ─── 1. Discovery ──────────────────────────────────────────────────────────

  it('discovers manifest from running server', async () => {
    const client = await SurfClient.discover(baseUrl);
    expect(client.manifest.name).toBe('E2E-Shop');
    expect(client.manifest.version).toBe('1.0.0');
    expect(client.manifest.surf).toBeDefined();
    expect(client.manifest.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('lists all commands from manifest', async () => {
    const client = await SurfClient.discover(baseUrl);
    const cmds = client.commands();
    expect(Object.keys(cmds)).toContain('search');
    expect(Object.keys(cmds)).toContain('cart.add');
    expect(Object.keys(cmds)).toContain('checkout');
    expect(Object.keys(cmds)).toContain('admin.reset');
    expect(cmds['search'].description).toBe('Search for products');
  });

  // ─── 2. Command Execution ──────────────────────────────────────────────────

  it('executes search command and returns results', async () => {
    const client = await SurfClient.discover(baseUrl);
    const result = (await client.execute('search', { query: 'shoes' })) as {
      items: Array<{ id: number; name: string }>;
      total: number;
      limit: number;
    };
    expect(result.items).toHaveLength(2);
    expect(result.items[0].name).toBe('shoes result 1');
    expect(result.total).toBe(2);
    expect(result.limit).toBe(10);
  });

  it('applies default params', async () => {
    const client = await SurfClient.discover(baseUrl);
    const result = (await client.execute('search', { query: 'hats' })) as { limit: number };
    expect(result.limit).toBe(10);
  });

  it('rejects unknown commands', async () => {
    const client = await SurfClient.discover(baseUrl);
    await expect(client.execute('nonexistent')).rejects.toThrow(SurfClientError);
    try {
      await client.execute('nonexistent');
    } catch (e) {
      expect((e as SurfClientError).code).toBe('UNKNOWN_COMMAND');
    }
  });

  // ─── 3. Pipeline Execution ─────────────────────────────────────────────────

  it('executes pipeline: search → cart.add → cart.add', async () => {
    const client = await SurfClient.discover(baseUrl);
    const result = await client.pipeline([
      { command: 'search', params: { query: 'boots' } },
      { command: 'cart.add', params: { productId: 1 } },
      { command: 'cart.add', params: { productId: 2, quantity: 3 } },
    ]);

    expect(result.ok).toBe(true);
    expect(result.results).toHaveLength(3);
    expect(result.results[0].ok).toBe(true);
    expect(result.results[0].result.items).toHaveLength(2);
    expect(result.results[1].ok).toBe(true);
    expect(result.results[1].result.added).toBe(1);
    expect(result.results[2].ok).toBe(true);
    expect(result.results[2].result.added).toBe(2);
  });

  // ─── 4. Session State Persistence ──────────────────────────────────────────

  it('persists state across requests within a session', async () => {
    const client = await SurfClient.discover(baseUrl, { auth: VALID_TOKEN });
    const session = await client.startSession();

    // Add first item
    const r1 = (await session.execute('cart.add', { productId: 10 })) as {
      cartSize: number;
      cart: Array<{ id: number }>;
    };
    expect(r1.cartSize).toBe(1);

    // Add second item — cart should accumulate
    const r2 = (await session.execute('cart.add', { productId: 20, quantity: 2 })) as {
      cartSize: number;
      cart: Array<{ id: number }>;
    };
    expect(r2.cartSize).toBe(2);
    expect(r2.cart).toHaveLength(2);
    expect(r2.cart[0].id).toBe(10);
    expect(r2.cart[1].id).toBe(20);

    // Checkout (requires auth — session has token from client)
    const r3 = (await session.execute('checkout')) as {
      success: boolean;
      orderId: string;
      itemCount: number;
    };
    expect(r3.success).toBe(true);
    expect(r3.itemCount).toBe(2);
    expect(r3.orderId).toMatch(/^ORD-/);

    await session.end();
  });

  // ─── 5. Auth Enforcement ───────────────────────────────────────────────────

  it('rejects auth-required command without token', async () => {
    const client = await SurfClient.discover(baseUrl);
    await expect(client.execute('checkout')).rejects.toThrow(SurfClientError);
    try {
      await client.execute('checkout');
    } catch (e) {
      expect((e as SurfClientError).code).toBe('AUTH_REQUIRED');
    }
  });

  it('rejects auth-required command with invalid token', async () => {
    const client = await SurfClient.discover(baseUrl, { auth: 'wrong-token' });
    await expect(client.execute('checkout')).rejects.toThrow(SurfClientError);
    try {
      await client.execute('checkout');
    } catch (e) {
      expect((e as SurfClientError).code).toBe('AUTH_FAILED');
    }
  });

  it('allows auth-required command with valid token', async () => {
    const client = await SurfClient.discover(baseUrl, { auth: VALID_TOKEN });
    const result = (await client.execute('checkout')) as { success: boolean };
    // Cart is empty since no session, but command should succeed (auth-wise)
    expect(result.success).toBe(false);
    expect((result as { reason: string }).reason).toBe('Cart is empty');
  });

  it('allows non-auth commands without token', async () => {
    const client = await SurfClient.discover(baseUrl);
    const result = (await client.execute('search', { query: 'test' })) as { items: unknown[] };
    expect(result.items).toHaveLength(2);
  });

  // ─── 6. Rate Limiting ─────────────────────────────────────────────────────

  it('enforces global rate limit and returns 429', async () => {
    // Create a fresh surf instance with very tight rate limit for this test
    const tightSurf = createSurf({
      name: 'RateLimit-Test',
      rateLimit: {
        windowMs: 10000,
        maxRequests: 3,
        keyBy: 'global',
      },
      commands: {
        ping: {
          description: 'Simple ping',
          run: async () => ({ pong: true }),
        },
      },
    });

    const tightServer = http.createServer(async (req, res) => {
      try {
        await tightSurf.middleware()(req as never, res as never);
      } catch (err) {
        res.writeHead(500);
        res.end(String(err));
      }
    });

    await new Promise<void>((resolve) => {
      tightServer.listen(0, '127.0.0.1', () => resolve());
    });

    const tightAddr = tightServer.address() as { port: number };
    const tightUrl = `http://127.0.0.1:${tightAddr.port}`;

    try {
      const client = await SurfClient.discover(tightUrl);

      // First 3 requests should succeed
      for (let i = 0; i < 3; i++) {
        const result = (await client.execute('ping')) as { pong: boolean };
        expect(result.pong).toBe(true);
      }

      // 4th request should be rate limited
      await expect(client.execute('ping')).rejects.toThrow(SurfClientError);
      try {
        await client.execute('ping');
      } catch (e) {
        expect((e as SurfClientError).code).toBe('RATE_LIMITED');
      }
    } finally {
      await new Promise<void>((resolve, reject) => {
        tightServer.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});
