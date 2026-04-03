import { describe, it, expect } from 'vitest';
import { createSurf } from '../../src/surf.js';
import type { SurfConfig } from '../../src/types.js';

// Mock req/res helpers
function mockReq(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
  return {
    method,
    url,
    headers,
    body,
  };
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
    end(body?: string) {
      if (body) _body = body;
    },
    get statusCode() { return _statusCode; },
    get headers() { return _headers; },
    get body() { return _body; },
    json() { return _body ? JSON.parse(_body) : null; },
  };
}

async function createTestApp() {
  return await createSurf({
    name: 'TestApp',
    version: '1.0.0',
    authVerifier: async (token) => {
      if (token === 'valid') return { valid: true, claims: { role: 'admin' } };
      return { valid: false, reason: 'bad token' };
    },
    commands: {
      ping: {
        description: 'Ping',
        run: async () => 'pong',
      },
      echo: {
        description: 'Echo',
        params: { msg: { type: 'string', required: true } },
        run: async (p) => p.msg,
      },
      secret: {
        description: 'Secret',
        auth: 'required',
        run: async () => 'classified',
      },
      limited: {
        description: 'Rate limited',
        rateLimit: { windowMs: 60000, maxRequests: 1, keyBy: 'global' },
        run: async () => 'ok',
      },
    },
  });
}

describe('HTTP Transport', () => {
  it('manifest handler returns JSON with correct content-type', async () => {
    const app = await createTestApp();
    const handler = app.manifestHandler();
    const req = mockReq('GET', '/.well-known/surf.json');
    const res = mockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('application/json');
    const data = res.json();
    expect(data.name).toBe('TestApp');
    expect(data.commands).toBeDefined();
  });

  it('ETag/304 caching works', async () => {
    const app = await createTestApp();
    const handler = app.manifestHandler();

    // First request to get ETag
    const res1 = mockRes();
    await handler(mockReq('GET', '/.well-known/surf.json'), res1);
    expect(res1.statusCode).toBe(200);
    const etag = res1.headers['ETag'];
    expect(etag).toBeDefined();

    // Second request with If-None-Match
    const res2 = mockRes();
    await handler(mockReq('GET', '/.well-known/surf.json', undefined, { 'if-none-match': etag }), res2);
    expect(res2.statusCode).toBe(304);
  });

  it('execute handler processes commands', async () => {
    const app = await createTestApp();
    const handler = app.httpHandler();
    const req = mockReq('POST', '/surf/execute', { command: 'ping' });
    const res = mockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(data.ok).toBe(true);
    expect(data.result).toBe('pong');
  });

  it('execute handler returns 404 for unknown command', async () => {
    const app = await createTestApp();
    const handler = app.httpHandler();
    const req = mockReq('POST', '/surf/execute', { command: 'nonexistent' });
    const res = mockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(404);
    const data = res.json();
    expect(data.ok).toBe(false);
    expect(data.error.code).toBe('UNKNOWN_COMMAND');
  });

  it('execute handler returns 400 for invalid params', async () => {
    const app = await createTestApp();
    const handler = app.httpHandler();
    const req = mockReq('POST', '/surf/execute', { command: 'echo', params: {} });
    const res = mockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(400);
    const data = res.json();
    expect(data.ok).toBe(false);
    expect(data.error.code).toBe('INVALID_PARAMS');
  });

  it('execute handler returns 401 for auth required', async () => {
    const app = await createTestApp();
    const handler = app.httpHandler();
    const req = mockReq('POST', '/surf/execute', { command: 'secret' });
    const res = mockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(401);
    const data = res.json();
    expect(data.error.code).toBe('AUTH_REQUIRED');
  });

  it('execute handler returns 403 for bad auth', async () => {
    const app = await createTestApp();
    const handler = app.httpHandler();
    const req = mockReq('POST', '/surf/execute', { command: 'secret' }, { authorization: 'Bearer invalid' });
    const res = mockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(403);
    const data = res.json();
    expect(data.error.code).toBe('AUTH_FAILED');
  });

  it('execute handler returns 429 for rate limited', async () => {
    const app = await createTestApp();
    const handler = app.httpHandler();

    // First request passes
    const res1 = mockRes();
    await handler(mockReq('POST', '/surf/execute', { command: 'limited' }), res1);
    expect(res1.statusCode).toBe(200);

    // Second request is rate limited
    const res2 = mockRes();
    await handler(mockReq('POST', '/surf/execute', { command: 'limited' }), res2);
    expect(res2.statusCode).toBe(429);
    const data = res2.json();
    expect(data.error.code).toBe('RATE_LIMITED');
  });

  it('CORS headers present', async () => {
    const app = await createTestApp();
    const handler = app.httpHandler();
    const res = mockRes();
    await handler(mockReq('POST', '/surf/execute', { command: 'ping' }), res);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });

  it('session start handler returns 429 when rate limited', async () => {
    const app = await createSurf({
      name: 'TestApp',
      version: '1.0.0',
      commands: {
        ping: { description: 'Ping', run: async () => 'pong' },
      },
      sessionRateLimit: { windowMs: 60000, maxRequests: 2, keyBy: 'ip' },
    });
    const mw = app.middleware();

    // First two session starts should succeed
    const res1 = mockRes();
    await mw(mockReq('POST', '/surf/session/start', {}, { 'x-forwarded-for': '1.2.3.4' }), res1);
    expect(res1.statusCode).toBe(200);
    expect(res1.json().ok).toBe(true);
    expect(res1.json().sessionId).toBeDefined();

    const res2 = mockRes();
    await mw(mockReq('POST', '/surf/session/start', {}, { 'x-forwarded-for': '1.2.3.4' }), res2);
    expect(res2.statusCode).toBe(200);

    // Third should be rate limited
    const res3 = mockRes();
    await mw(mockReq('POST', '/surf/session/start', {}, { 'x-forwarded-for': '1.2.3.4' }), res3);
    expect(res3.statusCode).toBe(429);
    const data = res3.json();
    expect(data.ok).toBe(false);
    expect(data.error.code).toBe('RATE_LIMITED');
    expect(res3.headers['Retry-After']).toBeDefined();
  });

  it('session rate limit is per-IP — different IPs have separate limits', async () => {
    const app = await createSurf({
      name: 'TestApp',
      version: '1.0.0',
      commands: {
        ping: { description: 'Ping', run: async () => 'pong' },
      },
      sessionRateLimit: { windowMs: 60000, maxRequests: 1, keyBy: 'ip' },
    });
    const mw = app.middleware();

    // IP A — first request succeeds
    const res1 = mockRes();
    await mw(mockReq('POST', '/surf/session/start', {}, { 'x-forwarded-for': '10.0.0.1' }), res1);
    expect(res1.statusCode).toBe(200);

    // IP A — second request rate limited
    const res2 = mockRes();
    await mw(mockReq('POST', '/surf/session/start', {}, { 'x-forwarded-for': '10.0.0.1' }), res2);
    expect(res2.statusCode).toBe(429);

    // IP B — first request succeeds (separate limit)
    const res3 = mockRes();
    await mw(mockReq('POST', '/surf/session/start', {}, { 'x-forwarded-for': '10.0.0.2' }), res3);
    expect(res3.statusCode).toBe(200);
  });

  it('session rate limit auto-derives from global rateLimit config', async () => {
    const app = await createSurf({
      name: 'TestApp',
      version: '1.0.0',
      commands: {
        ping: { description: 'Ping', run: async () => 'pong' },
      },
      rateLimit: { windowMs: 60000, maxRequests: 100 },
      // No explicit sessionRateLimit — should auto-derive 10 req/60s per IP
    });
    const mw = app.middleware();

    // Should allow up to 10 session starts (auto-derived limit)
    for (let i = 0; i < 10; i++) {
      const res = mockRes();
      await mw(mockReq('POST', '/surf/session/start', {}, { 'x-forwarded-for': '1.2.3.4' }), res);
      expect(res.statusCode).toBe(200);
    }

    // 11th should be rate limited
    const res = mockRes();
    await mw(mockReq('POST', '/surf/session/start', {}, { 'x-forwarded-for': '1.2.3.4' }), res);
    expect(res.statusCode).toBe(429);
  });

  it('no session rate limit when no rateLimit configured', async () => {
    const app = await createSurf({
      name: 'TestApp',
      version: '1.0.0',
      commands: {
        ping: { description: 'Ping', run: async () => 'pong' },
      },
      // No rateLimit, no sessionRateLimit
    });
    const mw = app.middleware();

    // Should allow unlimited session starts
    for (let i = 0; i < 20; i++) {
      const res = mockRes();
      await mw(mockReq('POST', '/surf/session/start', {}, { 'x-forwarded-for': '1.2.3.4' }), res);
      expect(res.statusCode).toBe(200);
    }
  });

  it('middleware handler routes to correct endpoints', async () => {
    const app = await createTestApp();
    const mw = app.middleware();

    // Manifest
    const res1 = mockRes();
    await mw(mockReq('GET', '/.well-known/surf.json'), res1);
    expect(res1.statusCode).toBe(200);
    expect(res1.json().name).toBe('TestApp');

    // Execute
    const res2 = mockRes();
    await mw(mockReq('POST', '/surf/execute', { command: 'ping' }), res2);
    expect(res2.statusCode).toBe(200);
    expect(res2.json().result).toBe('pong');

    // 404 for unknown path
    const res3 = mockRes();
    await mw(mockReq('GET', '/unknown'), res3);
    expect(res3.statusCode).toBe(404);
  });
});
