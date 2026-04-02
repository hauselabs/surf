import { describe, it, expect } from 'vitest';
import { resolveCorsHeaders, resolveCorsPreflightHeaders } from '../src/cors.js';
import { createSurf } from '../src/surf.js';

describe('resolveCorsHeaders', () => {
  it('returns wildcard when config is undefined (default)', () => {
    const headers = resolveCorsHeaders(undefined, 'https://example.com');
    expect(headers).toEqual({ 'Access-Control-Allow-Origin': '*' });
  });

  it('returns wildcard when config is undefined and no origin', () => {
    const headers = resolveCorsHeaders(undefined, undefined);
    expect(headers).toEqual({ 'Access-Control-Allow-Origin': '*' });
  });

  it('returns wildcard when origin is "*"', () => {
    const headers = resolveCorsHeaders({ origin: '*' }, 'https://example.com');
    expect(headers).toEqual({ 'Access-Control-Allow-Origin': '*' });
  });

  it('echoes origin with credentials when origin is "*" and credentials true', () => {
    const headers = resolveCorsHeaders({ origin: '*', credentials: true }, 'https://example.com');
    expect(headers).toEqual({
      'Access-Control-Allow-Origin': 'https://example.com',
      'Access-Control-Allow-Credentials': 'true',
      'Vary': 'Origin',
    });
  });

  it('falls back to wildcard when origin "*" with credentials but no request origin', () => {
    const headers = resolveCorsHeaders({ origin: '*', credentials: true }, undefined);
    expect(headers).toEqual({ 'Access-Control-Allow-Origin': '*' });
  });

  it('allows matching single string origin', () => {
    const headers = resolveCorsHeaders({ origin: 'https://example.com' }, 'https://example.com');
    expect(headers).toEqual({
      'Access-Control-Allow-Origin': 'https://example.com',
      'Vary': 'Origin',
    });
  });

  it('rejects non-matching single string origin', () => {
    const headers = resolveCorsHeaders({ origin: 'https://example.com' }, 'https://evil.com');
    expect(headers).toEqual({});
  });

  it('returns empty when no request origin and explicit origin configured', () => {
    const headers = resolveCorsHeaders({ origin: 'https://example.com' }, undefined);
    expect(headers).toEqual({});
  });

  it('allows matching origin from array', () => {
    const config = { origin: ['https://example.com', 'https://staging.example.com'] };
    const headers = resolveCorsHeaders(config, 'https://staging.example.com');
    expect(headers).toEqual({
      'Access-Control-Allow-Origin': 'https://staging.example.com',
      'Vary': 'Origin',
    });
  });

  it('rejects non-matching origin from array', () => {
    const config = { origin: ['https://example.com', 'https://staging.example.com'] };
    const headers = resolveCorsHeaders(config, 'https://evil.com');
    expect(headers).toEqual({});
  });

  it('allows matching origin from function', () => {
    const config = { origin: (o: string) => o.endsWith('.example.com') };
    const headers = resolveCorsHeaders(config, 'https://app.example.com');
    expect(headers).toEqual({
      'Access-Control-Allow-Origin': 'https://app.example.com',
      'Vary': 'Origin',
    });
  });

  it('rejects non-matching origin from function', () => {
    const config = { origin: (o: string) => o.endsWith('.example.com') };
    const headers = resolveCorsHeaders(config, 'https://evil.com');
    expect(headers).toEqual({});
  });

  it('includes credentials header when credentials true and origin matches', () => {
    const config = { origin: 'https://example.com', credentials: true };
    const headers = resolveCorsHeaders(config, 'https://example.com');
    expect(headers).toEqual({
      'Access-Control-Allow-Origin': 'https://example.com',
      'Access-Control-Allow-Credentials': 'true',
      'Vary': 'Origin',
    });
  });

  it('does not include credentials header when origin does not match', () => {
    const config = { origin: 'https://example.com', credentials: true };
    const headers = resolveCorsHeaders(config, 'https://evil.com');
    expect(headers).toEqual({});
  });

  it('handles null origin', () => {
    const headers = resolveCorsHeaders(undefined, null);
    expect(headers).toEqual({ 'Access-Control-Allow-Origin': '*' });
  });
});

describe('resolveCorsPreflightHeaders', () => {
  it('includes methods and headers with wildcard origin', () => {
    const headers = resolveCorsPreflightHeaders(undefined, 'https://example.com');
    expect(headers).toEqual({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
  });

  it('uses custom methods', () => {
    const headers = resolveCorsPreflightHeaders(undefined, undefined, 'POST, OPTIONS');
    expect(headers['Access-Control-Allow-Methods']).toBe('POST, OPTIONS');
  });

  it('uses custom allowed headers', () => {
    const headers = resolveCorsPreflightHeaders(undefined, undefined, undefined, 'Content-Type');
    expect(headers['Access-Control-Allow-Headers']).toBe('Content-Type');
  });

  it('includes Vary header when origin is specific', () => {
    const config = { origin: 'https://example.com' };
    const headers = resolveCorsPreflightHeaders(config, 'https://example.com');
    expect(headers['Vary']).toBe('Origin');
    expect(headers['Access-Control-Allow-Origin']).toBe('https://example.com');
    expect(headers['Access-Control-Allow-Methods']).toBe('GET, POST, OPTIONS');
  });
});

describe('SurfInstance.corsHeaders', () => {
  it('returns wildcard by default (no cors config)', async () => {
    const surf = await createSurf({
      name: 'test',
      commands: { ping: { handler: () => ({ ok: true, result: 'pong' }) } },
    });
    expect(surf.corsHeaders('https://example.com')).toEqual({
      'Access-Control-Allow-Origin': '*',
    });
    expect(surf.corsConfig).toBeUndefined();
  });

  it('resolves configured CORS', async () => {
    const surf = await createSurf({
      name: 'test',
      cors: { origin: ['https://allowed.com'], credentials: true },
      commands: { ping: { handler: () => ({ ok: true, result: 'pong' }) } },
    });

    const allowed = surf.corsHeaders('https://allowed.com');
    expect(allowed).toEqual({
      'Access-Control-Allow-Origin': 'https://allowed.com',
      'Access-Control-Allow-Credentials': 'true',
      'Vary': 'Origin',
    });

    const denied = surf.corsHeaders('https://evil.com');
    expect(denied).toEqual({});
  });

  it('exposes corsPreflightHeaders', async () => {
    const surf = await createSurf({
      name: 'test',
      cors: { origin: 'https://allowed.com' },
      commands: { ping: { handler: () => ({ ok: true, result: 'pong' }) } },
    });

    const headers = surf.corsPreflightHeaders('https://allowed.com', 'POST, OPTIONS');
    expect(headers['Access-Control-Allow-Origin']).toBe('https://allowed.com');
    expect(headers['Access-Control-Allow-Methods']).toBe('POST, OPTIONS');
    expect(headers['Vary']).toBe('Origin');
  });

  it('corsConfig is accessible', async () => {
    const config = { origin: 'https://example.com' as const, credentials: true };
    const surf = await createSurf({
      name: 'test',
      cors: config,
      commands: { ping: { handler: () => ({ ok: true, result: 'pong' }) } },
    });
    expect(surf.corsConfig).toBeDefined();
    expect(surf.corsConfig?.credentials).toBe(true);
  });
});

describe('HTTP transport CORS integration', () => {
  function mockReq(method: string, url: string, origin: string, body?: Record<string, unknown>) {
    const bodyStr = body ? JSON.stringify(body) : '';
    return {
      method,
      url,
      headers: {
        'content-type': 'application/json',
        'origin': origin,
      },
      // Provide parsed body (middleware body parser already ran)
      body: body,
      on(event: string, cb: (...args: unknown[]) => void) {
        if (event === 'data') cb(Buffer.from(bodyStr));
        if (event === 'end') cb();
        return this;
      },
    };
  }

  function mockRes() {
    const chunks: Buffer[] = [];
    const state = { status: 0, headers: {} as Record<string, string> };
    const res = {
      writeHead(status: number, headers?: Record<string, string>) {
        state.status = status;
        state.headers = { ...state.headers, ...headers };
      },
      write(data: string) { chunks.push(Buffer.from(data)); return true; },
      end(body?: string) {
        if (body) chunks.push(Buffer.from(body));
      },
      get _status() { return state.status; },
      get _headers() { return state.headers; },
      get _body() { return Buffer.concat(chunks).toString(); },
    };
    return { res, state };
  }

  it('uses configured CORS headers in middleware response', async () => {
    const surf = await createSurf({
      name: 'test',
      cors: { origin: 'https://myapp.com' },
      commands: {
        ping: { handler: () => ({ ok: true, result: 'pong' }) },
      },
    });

    const handler = surf.middleware();
    const req = mockReq('POST', '/surf/execute', 'https://myapp.com', { command: 'ping' });
    const { res, state } = mockRes();

    await handler(req as never, res as never);

    expect(state.headers['Access-Control-Allow-Origin']).toBe('https://myapp.com');
    expect(state.headers['Vary']).toBe('Origin');
  });

  it('omits CORS origin header for non-matching origin', async () => {
    const surf = await createSurf({
      name: 'test',
      cors: { origin: 'https://myapp.com' },
      commands: {
        ping: { handler: () => ({ ok: true, result: 'pong' }) },
      },
    });

    const handler = surf.middleware();
    const req = mockReq('POST', '/surf/execute', 'https://evil.com', { command: 'ping' });
    const { res, state } = mockRes();

    await handler(req as never, res as never);

    expect(state.headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('OPTIONS preflight uses CORS config', async () => {
    const surf = await createSurf({
      name: 'test',
      cors: { origin: ['https://myapp.com'], credentials: true },
      commands: {
        ping: { handler: () => ({ ok: true, result: 'pong' }) },
      },
    });

    const handler = surf.middleware();
    const req = mockReq('OPTIONS', '/surf/execute', 'https://myapp.com');
    const { res, state } = mockRes();

    await handler(req as never, res as never);

    expect(state.status).toBe(204);
    expect(state.headers['Access-Control-Allow-Origin']).toBe('https://myapp.com');
    expect(state.headers['Access-Control-Allow-Credentials']).toBe('true');
    expect(state.headers['Access-Control-Allow-Methods']).toBe('GET, POST, OPTIONS');
    expect(state.headers['Vary']).toBe('Origin');
  });

  it('manifest handler uses CORS config', async () => {
    const surf = await createSurf({
      name: 'test',
      cors: { origin: 'https://myapp.com' },
      commands: {
        ping: { handler: () => ({ ok: true, result: 'pong' }) },
      },
    });

    const handler = surf.middleware();
    const req = {
      method: 'GET',
      url: '/.well-known/surf.json',
      headers: { 'origin': 'https://myapp.com' },
    };
    const { res, state } = mockRes();

    await handler(req as never, res as never);

    expect(state.status).toBe(200);
    expect(state.headers['Access-Control-Allow-Origin']).toBe('https://myapp.com');
    expect(state.headers['Vary']).toBe('Origin');
  });

  it('backwards compatible: no cors config sends wildcard', async () => {
    const surf = await createSurf({
      name: 'test',
      commands: {
        ping: { handler: () => ({ ok: true, result: 'pong' }) },
      },
    });

    const handler = surf.middleware();
    const req = mockReq('POST', '/surf/execute', 'https://anything.com', { command: 'ping' });
    const { res, state } = mockRes();

    await handler(req as never, res as never);

    expect(state.headers['Access-Control-Allow-Origin']).toBe('*');
  });
});
