import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSurf, bearerVerifier } from '@surfjs/core';
import type { SurfInstance } from '@surfjs/core';
import { createSurfRouteHandler } from '../src/index.js';
import { createSurfApiHandler } from '../src/pages.js';
import {
  getErrorStatus,
  extractAuth,
  extractIp,
  extractSessionId,
  CORS_HEADERS,
} from '../src/shared.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createTestSurf(): Promise<SurfInstance> {
  return await createSurf({
    name: 'TestApp',
    commands: {
      greet: {
        description: 'Greet someone',
        params: { name: { type: 'string', description: 'Name' } },
        run: async (params: Record<string, unknown>) => `Hello, ${params['name']}!`,
      },
      fail: {
        description: 'Always fails',
        run: async () => {
          throw new Error('Something broke');
        },
      },
      echo: {
        description: 'Echo params back',
        run: async (params: Record<string, unknown>) => params,
      },
      streamable: {
        description: 'Streaming command',
        stream: true,
        run: async (params: Record<string, unknown>, ctx: Record<string, unknown>) => {
          const emit = ctx['emit'] as ((data: unknown) => void) | undefined;
          if (emit) {
            emit({ chunk: 1 });
            emit({ chunk: 2 });
          }
          return 'stream-done';
        },
      },
    },
  });
}

async function createTestSurfWithAuth(): Promise<SurfInstance> {
  return await createSurf({
    name: 'AuthApp',
    authVerifier: bearerVerifier(['valid-token']),
    commands: {
      publicCmd: {
        description: 'A public command',
        run: async () => 'public',
      },
      hiddenCmd: {
        description: 'A hidden command requiring auth',
        auth: 'hidden',
        run: async () => 'hidden',
      },
    },
  });
}

function makeRequest(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

function makeContext(slug?: string[]): { params: Promise<{ slug?: string[] }> } {
  return { params: Promise.resolve({ slug }) };
}

/** Minimal mock for Pages API response */
function createMockPagesRes() {
  const headers: Record<string, string | number> = {};
  let statusCode = 200;
  let body: unknown = undefined;
  let ended = false;
  const chunks: string[] = [];
  let headWritten = false;

  const res = {
    setHeader(name: string, value: string | number) {
      headers[name] = value;
      return res;
    },
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(data: unknown) {
      body = data;
    },
    end(chunk?: string) {
      if (chunk) chunks.push(chunk);
      ended = true;
    },
    write(chunk: string) {
      chunks.push(chunk);
      return true;
    },
    writeHead(code: number, hdrs?: Record<string, string>) {
      statusCode = code;
      headWritten = true;
      if (hdrs) {
        for (const [k, v] of Object.entries(hdrs)) {
          headers[k] = v;
        }
      }
    },
    flushHeaders: vi.fn(),
    // Accessors for assertions
    get _statusCode() { return statusCode; },
    get _body() { return body; },
    get _headers() { return headers; },
    get _ended() { return ended; },
    get _chunks() { return chunks; },
    get _headWritten() { return headWritten; },
  };

  return res;
}

// ═══════════════════════════════════════════════════════════════════════════════
// shared.ts — Unit Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('shared utilities', () => {
  describe('getErrorStatus', () => {
    it('maps UNKNOWN_COMMAND to 404', () => {
      expect(getErrorStatus('UNKNOWN_COMMAND')).toBe(404);
    });

    it('maps NOT_FOUND to 404', () => {
      expect(getErrorStatus('NOT_FOUND')).toBe(404);
    });

    it('maps INVALID_PARAMS to 400', () => {
      expect(getErrorStatus('INVALID_PARAMS')).toBe(400);
    });

    it('maps AUTH_REQUIRED to 401', () => {
      expect(getErrorStatus('AUTH_REQUIRED')).toBe(401);
    });

    it('maps AUTH_FAILED to 403', () => {
      expect(getErrorStatus('AUTH_FAILED')).toBe(403);
    });

    it('maps SESSION_EXPIRED to 410', () => {
      expect(getErrorStatus('SESSION_EXPIRED')).toBe(410);
    });

    it('maps RATE_LIMITED to 429', () => {
      expect(getErrorStatus('RATE_LIMITED')).toBe(429);
    });

    it('maps NOT_SUPPORTED to 501', () => {
      expect(getErrorStatus('NOT_SUPPORTED')).toBe(501);
    });

    it('maps unknown codes to 500', () => {
      expect(getErrorStatus('SOME_OTHER_ERROR')).toBe(500);
    });
  });

  describe('extractAuth', () => {
    it('returns undefined for null', () => {
      expect(extractAuth(null)).toBeUndefined();
    });

    it('returns undefined for undefined', () => {
      expect(extractAuth(undefined)).toBeUndefined();
    });

    it('returns undefined for empty string', () => {
      expect(extractAuth('')).toBeUndefined();
    });

    it('strips Bearer prefix', () => {
      expect(extractAuth('Bearer my-token-123')).toBe('my-token-123');
    });

    it('returns raw value if no Bearer prefix', () => {
      expect(extractAuth('Basic abc123')).toBe('Basic abc123');
    });
  });

  describe('extractIp', () => {
    it('returns undefined when both headers are null', () => {
      expect(extractIp(null, null)).toBeUndefined();
    });

    it('extracts first IP from x-forwarded-for', () => {
      expect(extractIp('10.0.0.1, 10.0.0.2', null)).toBe('10.0.0.1');
    });

    it('trims whitespace from forwarded IP', () => {
      expect(extractIp(' 10.0.0.1 , 10.0.0.2', null)).toBe('10.0.0.1');
    });

    it('falls back to x-real-ip', () => {
      expect(extractIp(null, '192.168.1.1')).toBe('192.168.1.1');
    });

    it('prefers x-forwarded-for over x-real-ip', () => {
      expect(extractIp('10.0.0.1', '192.168.1.1')).toBe('10.0.0.1');
    });
  });

  describe('extractSessionId', () => {
    it('returns undefined for null', () => {
      expect(extractSessionId(null)).toBeUndefined();
    });

    it('returns undefined for non-object', () => {
      expect(extractSessionId('string')).toBeUndefined();
      expect(extractSessionId(42)).toBeUndefined();
    });

    it('returns undefined if sessionId is not a string', () => {
      expect(extractSessionId({ sessionId: 123 })).toBeUndefined();
    });

    it('returns sessionId when present and string', () => {
      expect(extractSessionId({ sessionId: 'abc-123' })).toBe('abc-123');
    });

    it('returns undefined for empty object', () => {
      expect(extractSessionId({})).toBeUndefined();
    });
  });

  describe('CORS_HEADERS', () => {
    it('includes Access-Control-Allow-Origin wildcard', () => {
      expect(CORS_HEADERS['Access-Control-Allow-Origin']).toBe('*');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// App Router — createSurfRouteHandler
// ═══════════════════════════════════════════════════════════════════════════════

describe('App Router — createSurfRouteHandler', () => {
  let surf: SurfInstance;
  let GET: ReturnType<typeof createSurfRouteHandler>['GET'];
  let POST: ReturnType<typeof createSurfRouteHandler>['POST'];

  beforeEach(async () => {
    surf = await createTestSurf();
    const handler = createSurfRouteHandler(surf);
    GET = handler.GET;
    POST = handler.POST;
  });

  // ─── GET routes ──────────────────────────────────────────────────────

  describe('GET manifest', () => {
    it('returns manifest at root slug', async () => {
      const req = makeRequest('http://localhost/api/surf');
      const res = await GET(req, makeContext(undefined));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('name', 'TestApp');
      expect(body).toHaveProperty('commands');
      expect(body).toHaveProperty('checksum');
    });

    it('returns manifest at /.well-known/surf.json slug', async () => {
      const req = makeRequest('http://localhost/api/surf/.well-known/surf.json');
      const res = await GET(req, makeContext(['.well-known', 'surf.json']));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('name', 'TestApp');
    });

    it('includes CORS headers', async () => {
      const req = makeRequest('http://localhost/api/surf');
      const res = await GET(req, makeContext(undefined));

      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('includes ETag and Cache-Control headers', async () => {
      const req = makeRequest('http://localhost/api/surf');
      const res = await GET(req, makeContext(undefined));

      expect(res.headers.get('ETag')).toBeTruthy();
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
    });

    it('returns 304 for matching ETag', async () => {
      const req1 = makeRequest('http://localhost/api/surf');
      const res1 = await GET(req1, makeContext(undefined));
      const etag = res1.headers.get('ETag')!;

      const req2 = makeRequest('http://localhost/api/surf', {
        headers: { 'If-None-Match': etag },
      });
      const res2 = await GET(req2, makeContext(undefined));

      expect(res2.status).toBe(304);
    });

    it('returns 404 for unknown GET routes', async () => {
      const req = makeRequest('http://localhost/api/surf/unknown');
      const res = await GET(req, makeContext(['unknown']));

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('excludes hidden commands from manifest without auth', async () => {
      const authSurf = await createTestSurfWithAuth();
      const handler = createSurfRouteHandler(authSurf);
      const req = makeRequest('http://localhost/api/surf');
      const res = await handler.GET(req, makeContext(undefined));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.commands).toHaveProperty('publicCmd');
      expect(body.commands).not.toHaveProperty('hiddenCmd');
    });

    it('includes hidden commands in manifest with valid auth token', async () => {
      const authSurf = await createTestSurfWithAuth();
      const handler = createSurfRouteHandler(authSurf);
      const req = makeRequest('http://localhost/api/surf', {
        headers: { 'Authorization': 'Bearer valid-token' },
      });
      const res = await handler.GET(req, makeContext(undefined));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.commands).toHaveProperty('publicCmd');
      expect(body.commands).toHaveProperty('hiddenCmd');
    });

    it('excludes hidden commands from manifest with invalid auth token', async () => {
      const authSurf = await createTestSurfWithAuth();
      const handler = createSurfRouteHandler(authSurf);
      const req = makeRequest('http://localhost/api/surf', {
        headers: { 'Authorization': 'Bearer wrong-token' },
      });
      const res = await handler.GET(req, makeContext(undefined));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.commands).toHaveProperty('publicCmd');
      expect(body.commands).not.toHaveProperty('hiddenCmd');
    });
  });

  // ─── POST /execute ───────────────────────────────────────────────────

  describe('POST /execute', () => {
    it('executes a command successfully', async () => {
      const req = makeRequest('http://localhost/api/surf/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'greet', params: { name: 'World' } }),
      });
      const res = await POST(req, makeContext(['execute']));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.result).toBe('Hello, World!');
    });

    it('also works with /surf/execute slug', async () => {
      const req = makeRequest('http://localhost/api/surf/surf/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'greet', params: { name: 'Test' } }),
      });
      const res = await POST(req, makeContext(['surf', 'execute']));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });

    it('returns 400 for invalid JSON body', async () => {
      const req = makeRequest('http://localhost/api/surf/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json{{{',
      });
      const res = await POST(req, makeContext(['execute']));

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe('INVALID_PARAMS');
      expect(body.error.message).toContain('Invalid JSON');
    });

    it('returns 400 when command field is missing', async () => {
      const req = makeRequest('http://localhost/api/surf/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ params: {} }),
      });
      const res = await POST(req, makeContext(['execute']));

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('INVALID_PARAMS');
      expect(body.error.message).toContain('Missing command');
    });

    it('returns 400 when command field is not a string', async () => {
      const req = makeRequest('http://localhost/api/surf/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 42 }),
      });
      const res = await POST(req, makeContext(['execute']));

      expect(res.status).toBe(400);
    });

    it('returns 404 for unknown command', async () => {
      const req = makeRequest('http://localhost/api/surf/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'nonexistent', params: {} }),
      });
      const res = await POST(req, makeContext(['execute']));

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.ok).toBe(false);
    });

    it('forwards authorization header as auth context', async () => {
      const req = makeRequest('http://localhost/api/surf/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
        },
        body: JSON.stringify({ command: 'echo', params: {} }),
      });
      const res = await POST(req, makeContext(['execute']));

      expect(res.status).toBe(200);
    });

    it('includes CORS headers on error responses', async () => {
      const req = makeRequest('http://localhost/api/surf/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'nonexistent' }),
      });
      const res = await POST(req, makeContext(['execute']));

      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('returns SSE stream when stream=true and command supports it', async () => {
      const req = makeRequest('http://localhost/api/surf/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'streamable', params: {}, stream: true }),
      });
      const res = await POST(req, makeContext(['execute']));

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('text/event-stream');

      const text = await res.text();
      expect(text).toContain('data:');
      expect(text).toContain('"type":"chunk"');
      expect(text).toContain('"type":"done"');
    });
  });

  // ─── POST /session ───────────────────────────────────────────────────

  describe('POST /session', () => {
    it('creates a session via /session/start', async () => {
      const req = makeRequest('http://localhost/api/surf/session/start', {
        method: 'POST',
      });
      const res = await POST(req, makeContext(['session', 'start']));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.sessionId).toBeTruthy();
    });

    it('ends a session via /session/end', async () => {
      // First create a session
      const createReq = makeRequest('http://localhost/api/surf/session/start', {
        method: 'POST',
      });
      const createRes = await POST(createReq, makeContext(['session', 'start']));
      const { sessionId } = await createRes.json();

      // Now end it
      const endReq = makeRequest('http://localhost/api/surf/session/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      const endRes = await POST(endReq, makeContext(['session', 'end']));

      expect(endRes.status).toBe(200);
      const body = await endRes.json();
      expect(body.ok).toBe(true);
    });

    it('handles session/end with invalid body gracefully', async () => {
      const req = makeRequest('http://localhost/api/surf/session/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid-json',
      });
      const res = await POST(req, makeContext(['session', 'end']));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });
  });

  // ─── POST /pipeline ──────────────────────────────────────────────────

  describe('POST /pipeline', () => {
    it('returns 400 for invalid JSON', async () => {
      const req = makeRequest('http://localhost/api/surf/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      });
      const res = await POST(req, makeContext(['pipeline']));

      expect(res.status).toBe(400);
    });
  });

  // ─── Unknown routes ──────────────────────────────────────────────────

  describe('POST unknown routes', () => {
    it('returns 404 for unknown POST routes', async () => {
      const req = makeRequest('http://localhost/api/surf/unknown', {
        method: 'POST',
      });
      const res = await POST(req, makeContext(['unknown']));

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  // ─── Custom basePath ─────────────────────────────────────────────────

  describe('custom basePath', () => {
    it('resolves routes correctly with custom basePath', async () => {
      const handler = createSurfRouteHandler(surf, { basePath: '/custom/api' });

      // With slug, basePath doesn't affect routing
      const req = makeRequest('http://localhost/custom/api');
      const res = await handler.GET(req, makeContext(undefined));

      expect(res.status).toBe(200);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Pages Router — createSurfApiHandler
// ═══════════════════════════════════════════════════════════════════════════════

describe('Pages Router — createSurfApiHandler', () => {
  let surf: SurfInstance;
  let handler: ReturnType<typeof createSurfApiHandler>;

  beforeEach(async () => {
    surf = await createTestSurf();
    handler = createSurfApiHandler(surf);
  });

  describe('GET manifest', () => {
    it('returns manifest at root', async () => {
      const res = createMockPagesRes();
      await handler(
        { method: 'GET', url: '/api/surf', headers: {}, query: {}, body: undefined },
        res,
      );

      expect(res._statusCode).toBe(200);
      expect(res._body).toHaveProperty('name', 'TestApp');
    });

    it('returns manifest at /.well-known/surf.json slug', async () => {
      const res = createMockPagesRes();
      await handler(
        { method: 'GET', url: '/api/surf/.well-known/surf.json', headers: {}, query: { slug: ['.well-known', 'surf.json'] }, body: undefined },
        res,
      );

      expect(res._statusCode).toBe(200);
      expect(res._body).toHaveProperty('name', 'TestApp');
    });

    it('returns 304 for matching ETag', async () => {
      // First request to get ETag
      const res1 = createMockPagesRes();
      await handler(
        { method: 'GET', url: '/api/surf', headers: {}, query: {}, body: undefined },
        res1,
      );
      const etag = res1._headers['ETag'] as string;

      // Second request with ETag
      const res2 = createMockPagesRes();
      await handler(
        { method: 'GET', url: '/api/surf', headers: { 'if-none-match': etag }, query: {}, body: undefined },
        res2,
      );

      expect(res2._statusCode).toBe(304);
      expect(res2._ended).toBe(true);
    });

    it('includes CORS and caching headers', async () => {
      const res = createMockPagesRes();
      await handler(
        { method: 'GET', url: '/api/surf', headers: {}, query: {}, body: undefined },
        res,
      );

      expect(res._headers['Access-Control-Allow-Origin']).toBe('*');
      expect(res._headers['Cache-Control']).toBe('public, max-age=300');
      expect(res._headers['ETag']).toBeTruthy();
    });

    it('excludes hidden commands from manifest without auth', async () => {
      const authSurf = await createTestSurfWithAuth();
      const authHandler = createSurfApiHandler(authSurf);
      const res = createMockPagesRes();
      await authHandler(
        { method: 'GET', url: '/api/surf', headers: {}, query: {}, body: undefined },
        res,
      );

      expect(res._statusCode).toBe(200);
      const body = res._body as Record<string, unknown>;
      const commands = body['commands'] as Record<string, unknown>;
      expect(commands).toHaveProperty('publicCmd');
      expect(commands).not.toHaveProperty('hiddenCmd');
    });

    it('includes hidden commands in manifest with valid auth token', async () => {
      const authSurf = await createTestSurfWithAuth();
      const authHandler = createSurfApiHandler(authSurf);
      const res = createMockPagesRes();
      await authHandler(
        { method: 'GET', url: '/api/surf', headers: { 'authorization': 'Bearer valid-token' }, query: {}, body: undefined },
        res,
      );

      expect(res._statusCode).toBe(200);
      const body = res._body as Record<string, unknown>;
      const commands = body['commands'] as Record<string, unknown>;
      expect(commands).toHaveProperty('publicCmd');
      expect(commands).toHaveProperty('hiddenCmd');
    });

    it('excludes hidden commands from manifest with invalid auth token', async () => {
      const authSurf = await createTestSurfWithAuth();
      const authHandler = createSurfApiHandler(authSurf);
      const res = createMockPagesRes();
      await authHandler(
        { method: 'GET', url: '/api/surf', headers: { 'authorization': 'Bearer wrong-token' }, query: {}, body: undefined },
        res,
      );

      expect(res._statusCode).toBe(200);
      const body = res._body as Record<string, unknown>;
      const commands = body['commands'] as Record<string, unknown>;
      expect(commands).toHaveProperty('publicCmd');
      expect(commands).not.toHaveProperty('hiddenCmd');
    });
  });

  describe('Method enforcement', () => {
    it('returns 405 for non-GET/non-POST methods', async () => {
      const res = createMockPagesRes();
      await handler(
        { method: 'PUT', url: '/api/surf/execute', headers: {}, query: { slug: ['execute'] }, body: undefined },
        res,
      );

      expect(res._statusCode).toBe(405);
      const body = res._body as Record<string, unknown>;
      expect(body['ok']).toBe(false);
    });
  });

  describe('POST /execute', () => {
    it('executes a command successfully', async () => {
      const res = createMockPagesRes();
      await handler(
        {
          method: 'POST',
          url: '/api/surf/execute',
          headers: {},
          query: { slug: ['execute'] },
          body: { command: 'greet', params: { name: 'Pages' } },
        },
        res,
      );

      expect(res._statusCode).toBe(200);
      const body = res._body as Record<string, unknown>;
      expect(body['ok']).toBe(true);
      expect(body['result']).toBe('Hello, Pages!');
    });

    it('returns 400 when command field is missing', async () => {
      const res = createMockPagesRes();
      await handler(
        {
          method: 'POST',
          url: '/api/surf/execute',
          headers: {},
          query: { slug: ['execute'] },
          body: { params: {} },
        },
        res,
      );

      expect(res._statusCode).toBe(400);
    });

    it('returns 400 when body is undefined', async () => {
      const res = createMockPagesRes();
      await handler(
        {
          method: 'POST',
          url: '/api/surf/execute',
          headers: {},
          query: { slug: ['execute'] },
          body: undefined,
        },
        res,
      );

      expect(res._statusCode).toBe(400);
    });

    it('forwards auth and IP headers', async () => {
      const res = createMockPagesRes();
      await handler(
        {
          method: 'POST',
          url: '/api/surf/execute',
          headers: {
            'authorization': 'Bearer test-token',
            'x-forwarded-for': '10.0.0.1',
          },
          query: { slug: ['execute'] },
          body: { command: 'echo', params: { test: true } },
        },
        res,
      );

      expect(res._statusCode).toBe(200);
    });

    it('handles array header values', async () => {
      const res = createMockPagesRes();
      await handler(
        {
          method: 'POST',
          url: '/api/surf/execute',
          headers: {
            'authorization': ['Bearer token1', 'Bearer token2'],
          },
          query: { slug: ['execute'] },
          body: { command: 'echo', params: {} },
        },
        res,
      );

      expect(res._statusCode).toBe(200);
    });

    it('handles streaming for Pages Router', async () => {
      const res = createMockPagesRes();
      await handler(
        {
          method: 'POST',
          url: '/api/surf/execute',
          headers: {},
          query: { slug: ['execute'] },
          body: { command: 'streamable', params: {}, stream: true },
        },
        res,
      );

      expect(res._headWritten).toBe(true);
      expect(res._headers['Content-Type']).toBe('text/event-stream');
      expect(res._ended).toBe(true);
      expect(res._chunks.some((c: string) => c.includes('"type":"chunk"'))).toBe(true);
      expect(res._chunks.some((c: string) => c.includes('"type":"done"'))).toBe(true);
      expect(res.flushHeaders).toHaveBeenCalled();
    });
  });

  describe('POST /session', () => {
    it('creates a session', async () => {
      const res = createMockPagesRes();
      await handler(
        {
          method: 'POST',
          url: '/api/surf/session/start',
          headers: {},
          query: { slug: ['session', 'start'] },
          body: undefined,
        },
        res,
      );

      expect(res._statusCode).toBe(200);
      const body = res._body as Record<string, unknown>;
      expect(body['ok']).toBe(true);
      expect(body['sessionId']).toBeTruthy();
    });

    it('ends a session', async () => {
      // Create
      const createRes = createMockPagesRes();
      await handler(
        { method: 'POST', url: '/api/surf/session/start', headers: {}, query: { slug: ['session', 'start'] }, body: undefined },
        createRes,
      );
      const sessionId = (createRes._body as Record<string, unknown>)['sessionId'] as string;

      // End
      const endRes = createMockPagesRes();
      await handler(
        {
          method: 'POST',
          url: '/api/surf/session/end',
          headers: {},
          query: { slug: ['session', 'end'] },
          body: { sessionId },
        },
        endRes,
      );

      expect(endRes._statusCode).toBe(200);
    });
  });

  describe('POST /pipeline', () => {
    it('returns 400 when body is missing', async () => {
      const res = createMockPagesRes();
      await handler(
        {
          method: 'POST',
          url: '/api/surf/pipeline',
          headers: {},
          query: { slug: ['pipeline'] },
          body: undefined,
        },
        res,
      );

      expect(res._statusCode).toBe(400);
    });
  });

  describe('Unknown routes', () => {
    it('returns 404 for unknown POST routes', async () => {
      const res = createMockPagesRes();
      await handler(
        {
          method: 'POST',
          url: '/api/surf/unknown',
          headers: {},
          query: { slug: ['unknown'] },
          body: undefined,
        },
        res,
      );

      expect(res._statusCode).toBe(404);
    });
  });

  describe('route with slug as string', () => {
    it('handles single string slug param', async () => {
      const res = createMockPagesRes();
      await handler(
        {
          method: 'POST',
          url: '/api/surf/execute',
          headers: {},
          query: { slug: 'execute' },
          body: { command: 'echo', params: { x: 1 } },
        },
        res,
      );

      expect(res._statusCode).toBe(200);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Middleware — surfMiddleware
// ═══════════════════════════════════════════════════════════════════════════════

describe('surfMiddleware', () => {
  // We can't easily import the real Next.js middleware types, so we test
  // the module exports and basic logic via dynamic import
  it('is exported from middleware module', async () => {
    const mod = await import('../src/middleware.js');
    expect(typeof mod.surfMiddleware).toBe('function');
  });
});
