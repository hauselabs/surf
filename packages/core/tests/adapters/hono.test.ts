import { describe, it, expect } from 'vitest';
import { honoAppSync } from '../../src/adapters/hono.js';
import { createSurf } from '../../src/surf.js';

// ─── Minimal Hono mock ─────────────────────────────────────────────────────

interface MockRoute {
  method: string;
  path: string;
  handler: (c: MockHonoContext) => Response | Promise<Response>;
}

interface MockHonoContext {
  req: MockHonoRequest;
  json(data: unknown, status?: number, headers?: Record<string, string>): Response;
  body(data: null, status?: number, headers?: Record<string, string>): Response;
}

interface MockHonoRequest {
  json(): Promise<unknown>;
  header(name: string): string | undefined;
}

function createMockHonoContext(
  bodyData?: unknown,
  headers: Record<string, string> = {},
): MockHonoContext {
  return {
    req: {
      async json() {
        return bodyData;
      },
      header(name: string) {
        return headers[name.toLowerCase()] ?? headers[name];
      },
    },
    json(data: unknown, status?: number, hdrs?: Record<string, string>) {
      return new Response(JSON.stringify(data), {
        status: status ?? 200,
        headers: { 'Content-Type': 'application/json', ...hdrs },
      });
    },
    body(data: null, status?: number, hdrs?: Record<string, string>) {
      return new Response(data, {
        status: status ?? 200,
        headers: hdrs,
      });
    },
  };
}

/**
 * Fake Hono class that captures routes and allows manual dispatch.
 */
class FakeHono {
  routes: MockRoute[] = [];

  options(path: string, handler: MockRoute['handler']) {
    this.routes.push({ method: 'OPTIONS', path, handler });
  }

  get(path: string, handler: MockRoute['handler']) {
    this.routes.push({ method: 'GET', path, handler });
  }

  post(path: string, handler: MockRoute['handler']) {
    this.routes.push({ method: 'POST', path, handler });
  }

  fetch(_request: Request, _env?: unknown, _ctx?: unknown): Response | Promise<Response> {
    throw new Error('Use findRoute + handler instead');
  }

  findRoute(method: string, path: string) {
    return this.routes.find((r) => r.method === method && r.path === path);
  }
}

// ─── Test suite ─────────────────────────────────────────────────────────────

async function createTestSurf() {
  return await createSurf({
    name: 'HonoTest',
    version: '2.0.0',
    commands: {
      ping: {
        description: 'Ping',
        run: async () => 'pong',
      },
      greet: {
        description: 'Greet',
        params: { name: { type: 'string', required: true } },
        run: async (p) => `Hello, ${(p as { name: string }).name}!`,
      },
      secret: {
        description: 'Auth required',
        auth: 'required',
        run: async () => 'classified',
      },
    },
    authVerifier: async (token) => {
      if (token === 'valid-token') return { valid: true, claims: { role: 'user' } };
      return { valid: false, reason: 'bad' };
    },
  });
}

describe('Hono Adapter', () => {
  it('registers all expected routes', async () => {
    const surf = await createTestSurf();
    // Use honoAppSync with our FakeHono
    const app = honoAppSync(surf, FakeHono as unknown as new () => ReturnType<typeof honoAppSync>);
    const fakeApp = app as unknown as FakeHono;

    const methods = fakeApp.routes.map((r) => `${r.method} ${r.path}`);
    expect(methods).toContain('OPTIONS /.well-known/surf.json');
    expect(methods).toContain('OPTIONS /surf/execute');
    expect(methods).toContain('OPTIONS /surf/pipeline');
    expect(methods).toContain('OPTIONS /surf/session/start');
    expect(methods).toContain('OPTIONS /surf/session/end');
    expect(methods).toContain('GET /.well-known/surf.json');
    expect(methods).toContain('POST /surf/execute');
    expect(methods).toContain('POST /surf/pipeline');
    expect(methods).toContain('POST /surf/session/start');
    expect(methods).toContain('POST /surf/session/end');
  });

  it('OPTIONS routes return 204', async () => {
    const surf = await createTestSurf();
    const app = honoAppSync(surf, FakeHono as unknown as new () => ReturnType<typeof honoAppSync>);
    const fakeApp = app as unknown as FakeHono;

    const route = fakeApp.findRoute('OPTIONS', '/surf/execute');
    expect(route).toBeDefined();

    const ctx = createMockHonoContext();
    const response = await route!.handler(ctx);
    expect(response.status).toBe(204);
  });

  it('GET /.well-known/surf.json returns manifest', async () => {
    const surf = await createTestSurf();
    const app = honoAppSync(surf, FakeHono as unknown as new () => ReturnType<typeof honoAppSync>);
    const fakeApp = app as unknown as FakeHono;

    const route = fakeApp.findRoute('GET', '/.well-known/surf.json');
    const ctx = createMockHonoContext();
    const response = await route!.handler(ctx);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.name).toBe('HonoTest');
    expect(body.version).toBe('2.0.0');
    expect(body.commands).toBeDefined();
  });

  it('manifest returns 304 for matching ETag', async () => {
    const surf = await createTestSurf();
    const app = honoAppSync(surf, FakeHono as unknown as new () => ReturnType<typeof honoAppSync>);
    const fakeApp = app as unknown as FakeHono;

    const route = fakeApp.findRoute('GET', '/.well-known/surf.json');

    // First request to get ETag
    const ctx1 = createMockHonoContext();
    const response1 = await route!.handler(ctx1);
    const etag = response1.headers.get('ETag') ?? '';

    // Second request with If-None-Match
    const ctx2 = createMockHonoContext(undefined, { 'if-none-match': etag });
    const response2 = await route!.handler(ctx2);
    expect(response2.status).toBe(304);
  });

  it('POST /surf/execute runs a command', async () => {
    const surf = await createTestSurf();
    const app = honoAppSync(surf, FakeHono as unknown as new () => ReturnType<typeof honoAppSync>);
    const fakeApp = app as unknown as FakeHono;

    const route = fakeApp.findRoute('POST', '/surf/execute');
    const ctx = createMockHonoContext({ command: 'ping' });
    const response = await route!.handler(ctx);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.result).toBe('pong');
  });

  it('execute with params works', async () => {
    const surf = await createTestSurf();
    const app = honoAppSync(surf, FakeHono as unknown as new () => ReturnType<typeof honoAppSync>);
    const fakeApp = app as unknown as FakeHono;

    const route = fakeApp.findRoute('POST', '/surf/execute');
    const ctx = createMockHonoContext({ command: 'greet', params: { name: 'World' } });
    const response = await route!.handler(ctx);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.result).toBe('Hello, World!');
  });

  it('execute returns 400 for missing command', async () => {
    const surf = await createTestSurf();
    const app = honoAppSync(surf, FakeHono as unknown as new () => ReturnType<typeof honoAppSync>);
    const fakeApp = app as unknown as FakeHono;

    const route = fakeApp.findRoute('POST', '/surf/execute');
    const ctx = createMockHonoContext({ params: {} });
    const response = await route!.handler(ctx);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('INVALID_PARAMS');
  });

  it('execute returns 400 for invalid JSON', async () => {
    const surf = await createTestSurf();
    const app = honoAppSync(surf, FakeHono as unknown as new () => ReturnType<typeof honoAppSync>);
    const fakeApp = app as unknown as FakeHono;

    const route = fakeApp.findRoute('POST', '/surf/execute');
    // Simulate JSON parse failure
    const ctx = createMockHonoContext();
    ctx.req.json = async () => { throw new Error('Invalid JSON'); };
    const response = await route!.handler(ctx);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('INVALID_PARAMS');
  });

  it('execute forwards auth token', async () => {
    const surf = await createTestSurf();
    const app = honoAppSync(surf, FakeHono as unknown as new () => ReturnType<typeof honoAppSync>);
    const fakeApp = app as unknown as FakeHono;

    const route = fakeApp.findRoute('POST', '/surf/execute');

    // Without auth → should fail
    const ctx1 = createMockHonoContext({ command: 'secret' });
    const response1 = await route!.handler(ctx1);
    const body1 = await response1.json();
    expect(body1.ok).toBe(false);

    // With valid auth → success
    const ctx2 = createMockHonoContext(
      { command: 'secret' },
      { authorization: 'Bearer valid-token' },
    );
    const response2 = await route!.handler(ctx2);
    const body2 = await response2.json();
    expect(body2.ok).toBe(true);
    expect(body2.result).toBe('classified');
  });

  it('POST /surf/session/start creates a session', async () => {
    const surf = await createTestSurf();
    const app = honoAppSync(surf, FakeHono as unknown as new () => ReturnType<typeof honoAppSync>);
    const fakeApp = app as unknown as FakeHono;

    const route = fakeApp.findRoute('POST', '/surf/session/start');
    const ctx = createMockHonoContext();
    const response = await route!.handler(ctx);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(typeof body.sessionId).toBe('string');
  });

  it('POST /surf/session/end destroys a session', async () => {
    const surf = await createTestSurf();
    const app = honoAppSync(surf, FakeHono as unknown as new () => ReturnType<typeof honoAppSync>);
    const fakeApp = app as unknown as FakeHono;

    // Create session
    const startRoute = fakeApp.findRoute('POST', '/surf/session/start');
    const startCtx = createMockHonoContext();
    const startRes = await startRoute!.handler(startCtx);
    const { sessionId } = await startRes.json();

    // End session
    const endRoute = fakeApp.findRoute('POST', '/surf/session/end');
    const endCtx = createMockHonoContext({ sessionId });
    const endRes = await endRoute!.handler(endCtx);

    expect(endRes.status).toBe(200);
    const body = await endRes.json();
    expect(body.ok).toBe(true);
  });

  it('execute with expired session returns 410', async () => {
    const surf = await createTestSurf();
    const app = honoAppSync(surf, FakeHono as unknown as new () => ReturnType<typeof honoAppSync>);
    const fakeApp = app as unknown as FakeHono;

    const route = fakeApp.findRoute('POST', '/surf/execute');
    const ctx = createMockHonoContext({ command: 'ping', sessionId: 'sess_nonexistent' });
    const response = await route!.handler(ctx);

    expect(response.status).toBe(410);
    const body = await response.json();
    expect(body.ok).toBe(false);
  });
});
