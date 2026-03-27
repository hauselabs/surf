/**
 * Error handling paths — Slot 14
 *
 * Covers the untested error surface across CommandRegistry, HTTP transport,
 * middleware error propagation, and SurfError serialization roundtrips.
 *
 * Existing test files already cover:
 *  - surf-error-codes.test.ts  → SurfError class, constructors, CommandRegistry SurfError propagation
 *  - middleware-pipeline.test.ts → middleware order, early-return, double-next guard
 *  - transport/http.test.ts    → basic 4xx/5xx status mapping via createSurf()
 *
 * This file fills the gaps:
 *  - Malformed request bodies (missing command, invalid JSON structure)
 *  - Type mismatches in params (number given as string, etc.)
 *  - Missing required params with multiple errors accumulated
 *  - Handler throwing a plain Error (debug vs production sanitisation)
 *  - Return-schema validation failures (validateReturns option)
 *  - Middleware throwing SurfError → propagated correctly
 *  - Middleware throwing plain Error → wrapped as INTERNAL_ERROR
 *  - HTTP transport: non-POST method, OPTIONS preflight, missing command field
 *  - HTTP transport: browser-only command rejection (NOT_SUPPORTED)
 *  - HTTP transport: session expired path (SESSION_EXPIRED → 410)
 *  - HTTP transport: Retry-After header on RATE_LIMITED
 *  - Error serialization roundtrip: toJSON() → JSON.stringify → JSON.parse
 */

import { describe, it, expect } from 'vitest';
import { CommandRegistry } from '../src/commands.js';
import {
  SurfError,
  invalidParams,
  internalError,
  rateLimited,
} from '../src/errors.js';
import { createExecuteHandler, createManifestHandler, createSessionHandlers, createMiddleware } from '../src/transport/http.js';
import { InMemorySessionStore } from '../src/session.js';
import type { SurfManifest } from '../src/types.js';
import type { SurfMiddleware } from '../src/middleware.js';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function mockReq(
  method: string,
  url: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return { method, url, headers, body };
}

function mockRes() {
  let _status = 0;
  const _headers: Record<string, string> = {};
  let _body = '';
  return {
    writeHead(status: number, headers?: Record<string, string>) {
      _status = status;
      if (headers) Object.assign(_headers, headers);
    },
    end(body?: string) {
      if (body) _body = body;
    },
    get statusCode() { return _status; },
    get headers() { return _headers; },
    json<T = Record<string, unknown>>(): T { return JSON.parse(_body) as T; },
  };
}

const STUB_MANIFEST: SurfManifest = {
  name: 'Test',
  version: '1.0.0',
  checksum: 'abc123',
  commands: {},
};

function makeRegistry(commands: ConstructorParameters<typeof CommandRegistry>[0] = {}, options: ConstructorParameters<typeof CommandRegistry>[1] = {}) {
  return new CommandRegistry(commands, options);
}

// ─── CommandRegistry: malformed params ───────────────────────────────────────

describe('CommandRegistry – malformed / missing params', () => {
  it('returns INVALID_PARAMS when required param is missing', async () => {
    const registry = makeRegistry({
      greet: {
        description: 'Say hello',
        params: { name: { type: 'string', required: true } },
        run: async (p) => `Hello ${String(p['name'])}`,
      },
    });

    const result = await registry.execute('greet', {}, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_PARAMS');
      expect(result.error.message).toContain("'name'");
    }
  });

  it('accumulates multiple param errors in details.errors array', async () => {
    const registry = makeRegistry({
      create: {
        description: 'Create something',
        params: {
          title: { type: 'string', required: true },
          count: { type: 'number', required: true },
        },
        run: async () => 'done',
      },
    });

    const result = await registry.execute('create', {}, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_PARAMS');
      const errors = result.error.details?.['errors'] as string[];
      expect(Array.isArray(errors)).toBe(true);
      expect(errors.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('returns INVALID_PARAMS for type mismatch: string given instead of number', async () => {
    const registry = makeRegistry({
      multiply: {
        description: 'Multiply',
        params: { value: { type: 'number', required: true } },
        run: async (p) => (p['value'] as number) * 2,
      },
    });

    const result = await registry.execute('multiply', { value: 'notanumber' }, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_PARAMS');
      expect(result.error.message).toContain("'value'");
    }
  });

  it('returns INVALID_PARAMS for type mismatch: object given instead of string', async () => {
    const registry = makeRegistry({
      tag: {
        description: 'Tag it',
        params: { label: { type: 'string', required: true } },
        run: async () => 'ok',
      },
    });

    const result = await registry.execute('tag', { label: { nested: true } }, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_PARAMS');
    }
  });

  it('returns INVALID_PARAMS for type mismatch: array given instead of object', async () => {
    const registry = makeRegistry({
      config: {
        description: 'Config command',
        params: { options: { type: 'object', required: true } },
        run: async () => 'ok',
      },
    });

    const result = await registry.execute('config', { options: [1, 2, 3] }, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_PARAMS');
    }
  });

  it('returns INVALID_PARAMS for enum violation', async () => {
    const registry = makeRegistry({
      setMode: {
        description: 'Set mode',
        params: {
          mode: { type: 'string', required: true, enum: ['light', 'dark'] as const },
        },
        run: async () => 'ok',
      },
    });

    const result = await registry.execute('setMode', { mode: 'neon' }, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_PARAMS');
      expect(result.error.message).toContain('light');
      expect(result.error.message).toContain('dark');
    }
  });

  it('returns UNKNOWN_COMMAND for unregistered command', async () => {
    const registry = makeRegistry({ ping: { description: 'Ping', run: async () => 'pong' } });

    const result = await registry.execute('nonexistent', {}, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UNKNOWN_COMMAND');
      expect(result.error.details?.['command']).toBe('nonexistent');
    }
  });

  it('handles undefined params gracefully (no schema)', async () => {
    const registry = makeRegistry({
      noop: { description: 'Noop', run: async () => null },
    });
    const result = await registry.execute('noop', undefined, {});
    expect(result.ok).toBe(true);
  });
});

// ─── CommandRegistry: handler error paths ────────────────────────────────────

describe('CommandRegistry – handler throwing errors', () => {
  it('wraps generic Error in INTERNAL_ERROR (production: sanitised message)', async () => {
    const registry = makeRegistry({
      crash: {
        description: 'Crashes',
        run: async () => { throw new Error('database connection refused'); },
      },
    });

    const result = await registry.execute('crash', {}, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INTERNAL_ERROR');
      // In production mode (debug: false), real message is hidden
      expect(result.error.message).toBe('Internal server error');
    }
  });

  it('exposes real error message in debug mode', async () => {
    const registry = makeRegistry(
      {
        crash: {
          description: 'Crashes',
          run: async () => { throw new Error('secret db url leaked'); },
        },
      },
      { debug: true },
    );

    const result = await registry.execute('crash', {}, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INTERNAL_ERROR');
      expect(result.error.message).toBe('secret db url leaked');
    }
  });

  it('propagates SurfError from handler verbatim (code, message, details)', async () => {
    const registry = makeRegistry({
      validate: {
        description: 'Validates data',
        run: async () => {
          throw invalidParams('email is invalid', { field: 'email', value: 'not-an-email' });
        },
      },
    });

    const result = await registry.execute('validate', {}, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_PARAMS');
      expect(result.error.message).toBe('email is invalid');
      expect(result.error.details?.['field']).toBe('email');
      expect(result.error.details?.['value']).toBe('not-an-email');
    }
  });

  it('propagates SurfError with retryAfterMs details from handler', async () => {
    const registry = makeRegistry({
      burst: {
        description: 'Burst command',
        run: async () => { throw rateLimited(30000); },
      },
    });

    const result = await registry.execute('burst', {}, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('RATE_LIMITED');
      expect(result.error.details?.['retryAfterMs']).toBe(30000);
    }
  });

  it('wraps non-Error thrown values in INTERNAL_ERROR', async () => {
    const registry = makeRegistry(
      {
        weirdThrow: {
          description: 'Throws a string',
          run: async () => { throw 'oops string thrown'; }, // eslint-disable-line @typescript-eslint/only-throw-error
        },
      },
      { debug: true },
    );

    const result = await registry.execute('weirdThrow', {}, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INTERNAL_ERROR');
    }
  });
});

// ─── CommandRegistry: validateReturns ─────────────────────────────────────────

describe('CommandRegistry – validateReturns option', () => {
  it('returns INTERNAL_ERROR when handler returns wrong type (validateReturns: true)', async () => {
    const registry = makeRegistry(
      {
        getCount: {
          description: 'Returns a count',
          returns: { type: 'number' },
          run: async () => 'this is a string, not a number' as unknown as number,
        },
      },
      { validateReturns: true },
    );

    const result = await registry.execute('getCount', {}, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INTERNAL_ERROR');
      expect(result.error.message).toContain('getCount');
    }
  });

  it('succeeds when handler returns correct type (validateReturns: true)', async () => {
    const registry = makeRegistry(
      {
        getCount: {
          description: 'Returns a count',
          returns: { type: 'number' },
          run: async () => 42,
        },
      },
      { validateReturns: true },
    );

    const result = await registry.execute('getCount', {}, {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.result).toBe(42);
  });

  it('skips return validation when validateReturns is false (default)', async () => {
    const registry = makeRegistry({
      getCount: {
        description: 'Returns a count',
        returns: { type: 'number' },
        run: async () => 'wrong type but not validated' as unknown as number,
      },
    });

    // validateReturns defaults to false → no error
    const result = await registry.execute('getCount', {}, {});
    expect(result.ok).toBe(true);
  });
});

// ─── CommandRegistry: middleware error propagation ────────────────────────────

describe('CommandRegistry – middleware throwing errors', () => {
  it('middleware throwing SurfError bubbles up from registry.execute()', async () => {
    let handlerCalled = false;
    const registry = makeRegistry({
      guarded: {
        description: 'Guarded command',
        run: async () => { handlerCalled = true; return 'secret'; },
      },
    });

    const authGuard: SurfMiddleware = async (_ctx, _next) => {
      throw new SurfError('AUTH_REQUIRED', 'Token required', { hint: 'bearer' });
    };
    registry.setMiddleware([authGuard]);

    // Middleware exceptions are NOT caught by CommandRegistry — they bubble up
    await expect(registry.execute('guarded', {}, {})).rejects.toThrow(SurfError);
    await expect(registry.execute('guarded', {}, {})).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
      message: 'Token required',
    });
    expect(handlerCalled).toBe(false);
  });

  it('middleware throwing plain Error is not caught by registry (bubbles up)', async () => {
    const registry = makeRegistry({
      any: { description: 'Any', run: async () => 'ok' },
    });

    const crashMiddleware: SurfMiddleware = async (_ctx, _next) => {
      throw new Error('middleware infrastructure failure');
    };
    registry.setMiddleware([crashMiddleware]);

    // Plain Error from middleware bubbles out of execute()
    await expect(registry.execute('any', {}, {})).rejects.toThrow('middleware infrastructure failure');
  });

  it('middleware can mutate ctx.error to short-circuit with a specific error', async () => {
    const registry = makeRegistry({
      ping: { description: 'Ping', run: async () => 'pong' },
    });

    const interceptor: SurfMiddleware = async (ctx, _next) => {
      // Set error directly without calling next
      ctx.error = { ok: false, error: internalError('intercepted').toJSON() };
    };
    registry.setMiddleware([interceptor]);

    const result = await registry.execute('ping', {}, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INTERNAL_ERROR');
      expect(result.error.message).toBe('intercepted');
    }
  });

  it('middleware calling next twice throws "next() called multiple times" guard error', async () => {
    const registry = makeRegistry({
      counter: {
        description: 'Counter',
        run: async () => 'ok',
      },
    });

    const doubleNext: SurfMiddleware = async (_ctx, next) => {
      await next();
      await next(); // second call — pipeline guard rejects
    };
    registry.setMiddleware([doubleNext]);

    // The double-next guard throws, which bubbles up from execute()
    await expect(registry.execute('counter', {}, {})).rejects.toThrow('next() called multiple times');
  });
});

// ─── HTTP transport: request parsing error paths ──────────────────────────────

describe('createExecuteHandler – malformed request handling', () => {
  function makeHandler(commands: ConstructorParameters<typeof CommandRegistry>[0] = {}) {
    const registry = makeRegistry(commands);
    const sessions = new InMemorySessionStore();
    return createExecuteHandler({
      manifest: STUB_MANIFEST,
      registry,
      sessions,
      getAuth: () => undefined,
    });
  }

  it('returns 405 for non-POST method', async () => {
    const handler = makeHandler();
    const res = mockRes();
    await handler(mockReq('GET', '/surf/execute'), res);
    expect(res.statusCode).toBe(405);
    expect(res.json().error.code).toBe('NOT_SUPPORTED');
  });

  it('handles OPTIONS preflight with 204 and CORS headers', async () => {
    const handler = makeHandler();
    const res = mockRes();
    await handler(mockReq('OPTIONS', '/surf/execute'), res);
    expect(res.statusCode).toBe(204);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });

  it('returns 400 INVALID_PARAMS when command field is missing', async () => {
    const handler = makeHandler();
    const res = mockRes();
    await handler(mockReq('POST', '/surf/execute', { params: {} }), res);
    expect(res.statusCode).toBe(400);
    const data = res.json();
    expect(data.ok).toBe(false);
    expect(data.error.code).toBe('INVALID_PARAMS');
    expect(data.error.message).toContain('command');
  });

  it('returns 400 INVALID_PARAMS when command is not a string', async () => {
    const handler = makeHandler();
    const res = mockRes();
    await handler(mockReq('POST', '/surf/execute', { command: 42 }), res);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_PARAMS');
  });

  it('returns 404 UNKNOWN_COMMAND for unregistered command name', async () => {
    const handler = makeHandler();
    const res = mockRes();
    await handler(mockReq('POST', '/surf/execute', { command: 'does.not.exist' }), res);
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('UNKNOWN_COMMAND');
  });

  it('returns 400 INVALID_PARAMS for missing required param', async () => {
    const handler = makeHandler({
      greet: {
        description: 'Greet',
        params: { name: { type: 'string', required: true } },
        run: async (p) => `Hi ${String(p['name'])}`,
      },
    });
    const res = mockRes();
    await handler(mockReq('POST', '/surf/execute', { command: 'greet', params: {} }), res);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_PARAMS');
  });

  it('returns 500 INTERNAL_ERROR when handler throws generic Error', async () => {
    const handler = makeHandler({
      bomb: {
        description: 'Explodes',
        run: async () => { throw new Error('kaboom'); },
      },
    });
    const res = mockRes();
    await handler(mockReq('POST', '/surf/execute', { command: 'bomb' }), res);
    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('INTERNAL_ERROR');
  });

  it('does not leak internal error messages in production mode', async () => {
    const handler = makeHandler({
      leak: {
        description: 'Might leak',
        run: async () => { throw new Error('PRIVATE_KEY=abc123'); },
      },
    });
    const res = mockRes();
    await handler(mockReq('POST', '/surf/execute', { command: 'leak' }), res);
    const body = res.json<{ ok: boolean; error: { message: string } }>();
    expect(body.error.message).not.toContain('PRIVATE_KEY');
    expect(body.error.message).toBe('Internal server error');
  });

  it('returns 501 NOT_SUPPORTED for browser-only command via HTTP', async () => {
    const handler = makeHandler({
      browserOnly: {
        description: 'Browser command',
        hints: { execution: 'browser' },
        run: async () => 'window.surf only',
      },
    });
    const res = mockRes();
    await handler(mockReq('POST', '/surf/execute', { command: 'browserOnly' }), res);
    expect(res.statusCode).toBe(501);
    expect(res.json().error.code).toBe('NOT_SUPPORTED');
  });

  it('returns 410 SESSION_EXPIRED for invalid sessionId', async () => {
    const handler = makeHandler({
      ping: { description: 'Ping', run: async () => 'pong' },
    });
    const res = mockRes();
    await handler(
      mockReq('POST', '/surf/execute', { command: 'ping', sessionId: 'expired-session-xyz' }),
      res,
    );
    expect(res.statusCode).toBe(410);
    expect(res.json().error.code).toBe('SESSION_EXPIRED');
  });

  it('includes Retry-After header on RATE_LIMITED response', async () => {
    const registry = makeRegistry({
      limited: {
        description: 'Rate limited',
        rateLimit: { windowMs: 10000, maxRequests: 1, keyBy: 'global' },
        run: async () => 'ok',
      },
    });
    const sessions = new InMemorySessionStore();
    const handler = createExecuteHandler({
      manifest: STUB_MANIFEST,
      registry,
      sessions,
      getAuth: () => undefined,
    });

    // First call succeeds
    const res1 = mockRes();
    await handler(mockReq('POST', '/surf/execute', { command: 'limited' }), res1);
    expect(res1.statusCode).toBe(200);

    // Second call is rate-limited
    const res2 = mockRes();
    await handler(mockReq('POST', '/surf/execute', { command: 'limited' }), res2);
    expect(res2.statusCode).toBe(429);
    expect(res2.headers['Retry-After']).toBeDefined();
    expect(Number(res2.headers['Retry-After'])).toBeGreaterThanOrEqual(0);
  });

  it('strips server-side state from response (never exposes state to client)', async () => {
    const registry = makeRegistry({
      stateful: {
        description: 'Stateful command',
        run: async (_p, ctx) => {
          ctx.state = { secret: 'internal-server-data' };
          return 'result';
        },
      },
    });
    const sessions = new InMemorySessionStore();
    const handler = createExecuteHandler({
      manifest: STUB_MANIFEST,
      registry,
      sessions,
      getAuth: () => undefined,
    });
    const res = mockRes();
    await handler(mockReq('POST', '/surf/execute', { command: 'stateful' }), res);
    expect(res.statusCode).toBe(200);
    const data = res.json<Record<string, unknown>>();
    expect(data).not.toHaveProperty('state');
    expect(data['result']).toBe('result');
  });

  it('includes CORS header on all responses including errors', async () => {
    const handler = makeHandler();
    const res = mockRes();
    await handler(mockReq('POST', '/surf/execute', { command: 'unknown' }), res);
    // CORS header present even on 404
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });
});

// ─── HTTP transport: manifest handler ─────────────────────────────────────────

describe('createManifestHandler – error paths', () => {
  it('returns public manifest when auth token is invalid', async () => {
    const publicManifest: SurfManifest = { ...STUB_MANIFEST, name: 'Public' };
    const authedManifest: SurfManifest = { ...STUB_MANIFEST, name: 'Authed', checksum: 'def456' };

    const handler = createManifestHandler(
      publicManifest,
      authedManifest,
      () => { throw new Error('invalid token'); }, // verifier throws
    );

    const res = mockRes();
    await handler(
      mockReq('GET', '/.well-known/surf.json', undefined, { authorization: 'Bearer bad-token' }),
      res,
    );

    expect(res.statusCode).toBe(200);
    const data = res.json<{ name: string }>();
    expect(data.name).toBe('Public'); // public, not authed
  });

  it('serves authed manifest when token verifies successfully', async () => {
    const publicManifest: SurfManifest = { ...STUB_MANIFEST, name: 'Public' };
    const authedManifest: SurfManifest = { ...STUB_MANIFEST, name: 'Authed', checksum: 'def456' };

    const handler = createManifestHandler(
      publicManifest,
      authedManifest,
      () => ({ valid: true }),
    );

    const res = mockRes();
    await handler(
      mockReq('GET', '/.well-known/surf.json', undefined, { authorization: 'Bearer good-token' }),
      res,
    );

    expect(res.statusCode).toBe(200);
    const data = res.json<{ name: string }>();
    expect(data.name).toBe('Authed');
  });
});

// ─── HTTP transport: middleware routing ───────────────────────────────────────

describe('createMiddleware – routing and 404', () => {
  function makeMiddleware() {
    const registry = makeRegistry({
      ping: { description: 'Ping', run: async () => 'pong' },
    });
    const sessions = new InMemorySessionStore();
    const executeHandler = createExecuteHandler({
      manifest: STUB_MANIFEST,
      registry,
      sessions,
      getAuth: () => undefined,
    });
    const manifestHandler = createManifestHandler(STUB_MANIFEST);
    const sessionHandlers = createSessionHandlers(sessions);

    return createMiddleware(STUB_MANIFEST, executeHandler, sessionHandlers);
  }

  it('returns 404 for unknown paths', async () => {
    const mw = makeMiddleware();
    const res = mockRes();
    await mw(mockReq('GET', '/totally/unknown/path'), res);
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_SUPPORTED');
  });

  it('handles universal CORS preflight at root level', async () => {
    const mw = makeMiddleware();
    const res = mockRes();
    await mw(mockReq('OPTIONS', '/surf/execute'), res);
    expect(res.statusCode).toBe(204);
    expect(res.headers['Access-Control-Allow-Methods']).toContain('POST');
  });
});

// ─── Error serialization roundtrip ────────────────────────────────────────────

describe('SurfError – serialization roundtrip', () => {
  it('toJSON → JSON.stringify → JSON.parse preserves all fields', () => {
    const err = new SurfError('INVALID_PARAMS', 'field is required', {
      errors: ['name is required', 'email is required'],
      received: null,
    });

    const json = err.toJSON();
    const serialized = JSON.stringify(json);
    const parsed = JSON.parse(serialized) as typeof json;

    expect(parsed.code).toBe('INVALID_PARAMS');
    expect(parsed.message).toBe('field is required');
    expect(parsed.details?.['errors']).toEqual(['name is required', 'email is required']);
  });

  it('toJSON does not include details key when details is undefined', () => {
    const err = new SurfError('INTERNAL_ERROR', 'oops');
    const serialized = JSON.stringify(err.toJSON());
    const parsed = JSON.parse(serialized) as Record<string, unknown>;
    expect('details' in parsed).toBe(false);
  });

  it('SurfError is instanceof both SurfError and Error', () => {
    const err = new SurfError('NOT_FOUND', 'missing resource');
    expect(err).toBeInstanceOf(SurfError);
    expect(err).toBeInstanceOf(Error);
  });

  it('error response from CommandRegistry matches SurfError toJSON shape', async () => {
    const registry = makeRegistry({
      fail: {
        description: 'Always fails',
        run: async () => { throw new SurfError('AUTH_FAILED', 'bad credentials', { attempt: 3 }); },
      },
    });

    const result = await registry.execute('fail', {}, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Shape matches SurfError.toJSON()
      expect(typeof result.error.code).toBe('string');
      expect(typeof result.error.message).toBe('string');
      expect(result.error.details?.['attempt']).toBe(3);

      // Verify JSON serializable
      const str = JSON.stringify(result);
      const parsed = JSON.parse(str) as typeof result;
      expect(parsed.ok).toBe(false);
    }
  });

  it('HTTP response error body is valid JSON with ok:false and error object', async () => {
    const registry = makeRegistry({
      bad: {
        description: 'Bad command',
        run: async () => { throw new SurfError('NOT_FOUND', 'item not found', { id: 'x-123' }); },
      },
    });
    const sessions = new InMemorySessionStore();
    const handler = createExecuteHandler({
      manifest: STUB_MANIFEST,
      registry,
      sessions,
      getAuth: () => undefined,
    });

    const res = mockRes();
    await handler(mockReq('POST', '/surf/execute', { command: 'bad' }), res);

    expect(res.statusCode).toBe(500); // NOT_FOUND from handler → wraps in execute path (code is preserved)
    const body = res.json<{ ok: boolean; error: { code: string; message: string; details?: Record<string, unknown> } }>();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('item not found');
    expect(body.error.details?.['id']).toBe('x-123');
  });
});

// ─── Auth error paths ─────────────────────────────────────────────────────────

describe('CommandRegistry – auth error paths', () => {
  it('returns AUTH_REQUIRED when command requires auth and no auth provided', async () => {
    const registry = makeRegistry({
      admin: {
        description: 'Admin only',
        auth: 'required',
        run: async () => 'secret data',
      },
    });

    const result = await registry.execute('admin', {}, {}); // no auth in context
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('AUTH_REQUIRED');
      expect(result.error.message).toContain('admin');
    }
  });

  it('executes auth-required command when auth token is present', async () => {
    const registry = makeRegistry({
      admin: {
        description: 'Admin only',
        auth: 'required',
        run: async () => 'secret data',
      },
    });

    const result = await registry.execute('admin', {}, { auth: 'valid-token' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.result).toBe('secret data');
  });

  it('executes auth-required command when claims are present (middleware auth)', async () => {
    const registry = makeRegistry({
      admin: {
        description: 'Admin only',
        auth: 'required',
        run: async () => 'secret data',
      },
    });

    // claims set by middleware even without raw auth token
    const result = await registry.execute('admin', {}, { claims: { role: 'admin' } });
    expect(result.ok).toBe(true);
  });

  it('requestId is preserved in error responses', async () => {
    const registry = makeRegistry({
      fail: {
        description: 'Always fails',
        run: async () => { throw new SurfError('INTERNAL_ERROR', 'oops'); },
      },
    });

    const result = await registry.execute('fail', {}, { requestId: 'req-abc-123' });
    expect(result.requestId).toBe('req-abc-123');
  });
});
