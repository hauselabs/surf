import { describe, it, expect } from 'vitest';
import { createSurf } from '../src/surf.js';

// Mock req/res for HTTP handlers
function mockReq(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
  return { method, url, headers, body };
}

function mockRes() {
  let _statusCode = 0;
  let _headers: Record<string, string> = {};
  let _body = '';
  return {
    writeHead(status: number, headers?: Record<string, string>) {
      _statusCode = status;
      if (headers) _headers = { ..._headers, ...headers };
    },
    end(body?: string) { if (body) _body = body; },
    get statusCode() { return _statusCode; },
    get headers() { return _headers; },
    get body() { return _body; },
    json() { return _body ? JSON.parse(_body) : null; },
  };
}

describe('Integration: full Surf flow', () => {
  const app = createSurf({
    name: 'ShopAPI',
    version: '2.0.0',
    description: 'E-commerce API',
    commands: {
      'product.list': {
        description: 'List products',
        params: {
          category: { type: 'string' },
          limit: { type: 'number', default: 10 },
        },
        run: async (p) => ({
          products: [{ id: 1, name: 'Shoes', category: p.category ?? 'all' }],
          limit: p.limit,
        }),
      },
      'product.get': {
        description: 'Get product by ID',
        params: { id: { type: 'number', required: true } },
        run: async (p) => ({ id: p.id, name: 'Shoes', price: 99 }),
      },
      'cart.add': {
        description: 'Add to cart',
        params: {
          productId: { type: 'number', required: true },
          quantity: { type: 'number', default: 1 },
        },
        run: async (p, ctx) => {
          const state = ctx.state ?? {};
          const cart = (state.cart as number[] | undefined) ?? [];
          cart.push(p.productId as number);
          ctx.state = { ...state, cart };
          return { added: p.productId, cartSize: cart.length };
        },
      },
    },
  });

  it('discover → manifest has all commands', async () => {
    const mw = app.middleware();
    const res = mockRes();
    await mw(mockReq('GET', '/.well-known/surf.json'), res);

    expect(res.statusCode).toBe(200);
    const manifest = res.json();
    expect(manifest.name).toBe('ShopAPI');
    expect(manifest.version).toBe('2.0.0');
    expect(manifest.commands['product.list']).toBeDefined();
    expect(manifest.commands['product.get']).toBeDefined();
    expect(manifest.commands['cart.add']).toBeDefined();
    expect(manifest.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('execute a command via HTTP handler', async () => {
    const mw = app.middleware();
    const res = mockRes();
    await mw(
      mockReq('POST', '/surf/execute', {
        command: 'product.get',
        params: { id: 1 },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(data.ok).toBe(true);
    expect(data.result).toEqual({ id: 1, name: 'Shoes', price: 99 });
  });

  it('pipeline: list products → get first product', async () => {
    const mw = app.middleware();
    const res = mockRes();
    await mw(
      mockReq('POST', '/surf/pipeline', {
        steps: [
          { command: 'product.list', params: { category: 'footwear' }, as: 'listing' },
          { command: 'product.get', params: { id: 1 } },
        ],
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(data.ok).toBe(true);
    expect(data.results).toHaveLength(2);
    expect(data.results[0].result.products[0].category).toBe('footwear');
    expect(data.results[1].result).toEqual({ id: 1, name: 'Shoes', price: 99 });
  });

  it('default params are applied', async () => {
    const mw = app.middleware();
    const res = mockRes();
    await mw(
      mockReq('POST', '/surf/execute', {
        command: 'product.list',
        params: {},
      }),
      res,
    );

    const data = res.json();
    expect(data.ok).toBe(true);
    expect(data.result.limit).toBe(10);
  });

  it('session flow: start → add items → end', async () => {
    const mw = app.middleware();

    // Start session
    const startRes = mockRes();
    await mw(mockReq('POST', '/surf/session/start'), startRes);
    expect(startRes.statusCode).toBe(200);
    const sessionData = startRes.json();
    expect(sessionData.ok).toBe(true);
    expect(sessionData.sessionId).toBeDefined();

    // Execute with session
    const execRes = mockRes();
    await mw(
      mockReq('POST', '/surf/execute', {
        command: 'cart.add',
        params: { productId: 42 },
        sessionId: sessionData.sessionId,
      }),
      execRes,
    );
    expect(execRes.statusCode).toBe(200);
    const execData = execRes.json();
    expect(execData.ok).toBe(true);
    expect(execData.result.added).toBe(42);

    // End session
    const endRes = mockRes();
    await mw(
      mockReq('POST', '/surf/session/end', { sessionId: sessionData.sessionId }),
      endRes,
    );
    expect(endRes.statusCode).toBe(200);
  });

  it('ETag caching on manifest', async () => {
    const mw = app.middleware();

    const res1 = mockRes();
    await mw(mockReq('GET', '/.well-known/surf.json'), res1);
    const etag = res1.headers['ETag'];

    const res2 = mockRes();
    await mw(mockReq('GET', '/.well-known/surf.json', undefined, { 'if-none-match': etag }), res2);
    expect(res2.statusCode).toBe(304);
  });

  it('unknown command returns 404', async () => {
    const mw = app.middleware();
    const res = mockRes();
    await mw(
      mockReq('POST', '/surf/execute', { command: 'nonexistent' }),
      res,
    );
    expect(res.statusCode).toBe(404);
  });
});
