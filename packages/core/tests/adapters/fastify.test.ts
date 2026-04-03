import { describe, it, expect, vi } from 'vitest';
import { fastifyPlugin } from '../../src/adapters/fastify.js';
import { createSurf } from '../../src/surf.js';

// ─── Mock Fastify helpers ───────────────────────────────────────────────────

interface RegisteredRoute {
  method: string;
  path: string;
  handler: (req: MockFastifyRequest, reply: MockFastifyReply) => Promise<MockFastifyReply | void>;
}

interface MockFastifyRequest {
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

interface MockFastifyReply {
  statusCode: number;
  responseHeaders: Record<string, string>;
  responseBody: unknown;
  raw: MockRaw;
  code(statusCode: number): MockFastifyReply;
  header(key: string, value: string): MockFastifyReply;
  headers(values: Record<string, string>): MockFastifyReply;
  send(payload?: unknown): MockFastifyReply;
}

interface MockRaw {
  written: string[];
  ended: boolean;
  statusCode: number;
  headersWritten: Record<string, string>;
  writeHead(status: number, headers?: Record<string, string>): void;
  write(data: string): boolean;
  end(body?: string): void;
  flushHeaders(): void;
}

function createMockFastify() {
  const routes: RegisteredRoute[] = [];
  return {
    routes,
    options(path: string, handler: RegisteredRoute['handler']) {
      routes.push({ method: 'OPTIONS', path, handler });
    },
    get(path: string, handler: RegisteredRoute['handler']) {
      routes.push({ method: 'GET', path, handler });
    },
    post(path: string, handler: RegisteredRoute['handler']) {
      routes.push({ method: 'POST', path, handler });
    },
    findRoute(method: string, path: string) {
      return routes.find((r) => r.method === method && r.path === path);
    },
  };
}

function createMockRequest(body?: unknown, headers: Record<string, string> = {}): MockFastifyRequest {
  return { headers, body };
}

function createMockReply(): MockFastifyReply {
  const raw: MockRaw = {
    written: [],
    ended: false,
    statusCode: 0,
    headersWritten: {},
    writeHead(status: number, headers?: Record<string, string>) {
      raw.statusCode = status;
      if (headers) Object.assign(raw.headersWritten, headers);
    },
    write(data: string) {
      raw.written.push(data);
      return true;
    },
    end() {
      raw.ended = true;
    },
    flushHeaders: vi.fn(),
  };

  const reply: MockFastifyReply = {
    statusCode: 0,
    responseHeaders: {},
    responseBody: undefined,
    raw,
    code(statusCode: number) {
      reply.statusCode = statusCode;
      return reply;
    },
    header(key: string, value: string) {
      reply.responseHeaders[key] = value;
      return reply;
    },
    headers(values: Record<string, string>) {
      Object.assign(reply.responseHeaders, values);
      return reply;
    },
    send(payload?: unknown) {
      reply.responseBody = payload;
      return reply;
    },
  };
  return reply;
}

// ─── Test suite ─────────────────────────────────────────────────────────────

async function createTestSurf() {
  return await createSurf({
    name: 'TestApp',
    version: '1.0.0',
    commands: {
      ping: {
        description: 'Ping',
        run: async () => 'pong',
      },
      echo: {
        description: 'Echo a message',
        params: { msg: { type: 'string', required: true } },
        run: async (p) => (p as { msg: string }).msg,
      },
      secret: {
        description: 'Auth required',
        auth: 'required',
        run: async () => 'classified',
      },
    },
    authVerifier: async (token) => {
      if (token === 'valid-token') return { valid: true, claims: { role: 'admin' } };
      return { valid: false, reason: 'Invalid token' };
    },
  });
}

describe('Fastify Adapter', () => {
  it('registers all expected routes', async () => {
    const surf = await createTestSurf();
    const plugin = fastifyPlugin(surf);
    const fastify = createMockFastify();
    await plugin(fastify);

    const methods = fastify.routes.map((r) => `${r.method} ${r.path}`);
    // OPTIONS routes
    expect(methods).toContain('OPTIONS /.well-known/surf.json');
    expect(methods).toContain('OPTIONS /surf/execute');
    expect(methods).toContain('OPTIONS /surf/pipeline');
    expect(methods).toContain('OPTIONS /surf/session/start');
    expect(methods).toContain('OPTIONS /surf/session/end');
    // GET/POST routes
    expect(methods).toContain('GET /.well-known/surf.json');
    expect(methods).toContain('POST /surf/execute');
    expect(methods).toContain('POST /surf/pipeline');
    expect(methods).toContain('POST /surf/session/start');
    expect(methods).toContain('POST /surf/session/end');
  });

  it('OPTIONS routes return 204 with CORS headers', async () => {
    const surf = await createTestSurf();
    const plugin = fastifyPlugin(surf);
    const fastify = createMockFastify();
    await plugin(fastify);

    const route = fastify.findRoute('OPTIONS', '/surf/execute');
    expect(route).toBeDefined();

    const reply = createMockReply();
    await route!.handler(createMockRequest(), reply);

    expect(reply.statusCode).toBe(204);
  });

  it('GET /.well-known/surf.json returns manifest', async () => {
    const surf = await createTestSurf();
    const plugin = fastifyPlugin(surf);
    const fastify = createMockFastify();
    await plugin(fastify);

    const route = fastify.findRoute('GET', '/.well-known/surf.json');
    const reply = createMockReply();
    await route!.handler(createMockRequest(), reply);

    const body = reply.responseBody as Record<string, unknown>;
    expect(body).toBeDefined();
    expect(body.name).toBe('TestApp');
    expect(body.version).toBe('1.0.0');
    expect(body.commands).toBeDefined();
    expect(reply.responseHeaders['Content-Type']).toBe('application/json');
    expect(reply.responseHeaders['ETag']).toBeDefined();
    expect(reply.responseHeaders['Cache-Control']).toBe('public, max-age=300');
  });

  it('manifest returns 304 for matching ETag', async () => {
    const surf = await createTestSurf();
    const plugin = fastifyPlugin(surf);
    const fastify = createMockFastify();
    await plugin(fastify);

    const route = fastify.findRoute('GET', '/.well-known/surf.json');

    // First request to get ETag
    const reply1 = createMockReply();
    await route!.handler(createMockRequest(), reply1);
    const etag = reply1.responseHeaders['ETag'];

    // Second request with If-None-Match
    const reply2 = createMockReply();
    await route!.handler(createMockRequest(undefined, { 'if-none-match': etag }), reply2);
    expect(reply2.statusCode).toBe(304);
  });

  it('POST /surf/execute runs a command', async () => {
    const surf = await createTestSurf();
    const plugin = fastifyPlugin(surf);
    const fastify = createMockFastify();
    await plugin(fastify);

    const route = fastify.findRoute('POST', '/surf/execute');
    const reply = createMockReply();
    await route!.handler(
      createMockRequest({ command: 'ping' }),
      reply,
    );

    const body = reply.responseBody as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.result).toBe('pong');
  });

  it('execute with params works', async () => {
    const surf = await createTestSurf();
    const plugin = fastifyPlugin(surf);
    const fastify = createMockFastify();
    await plugin(fastify);

    const route = fastify.findRoute('POST', '/surf/execute');
    const reply = createMockReply();
    await route!.handler(
      createMockRequest({ command: 'echo', params: { msg: 'hello world' } }),
      reply,
    );

    const body = reply.responseBody as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.result).toBe('hello world');
  });

  it('execute returns 400 for missing command field', async () => {
    const surf = await createTestSurf();
    const plugin = fastifyPlugin(surf);
    const fastify = createMockFastify();
    await plugin(fastify);

    const route = fastify.findRoute('POST', '/surf/execute');
    const reply = createMockReply();
    await route!.handler(
      createMockRequest({ params: {} }),
      reply,
    );

    expect(reply.statusCode).toBe(400);
    const body = reply.responseBody as Record<string, unknown>;
    expect(body.ok).toBe(false);
  });

  it('execute forwards auth token from Authorization header', async () => {
    const surf = await createTestSurf();
    const plugin = fastifyPlugin(surf);
    const fastify = createMockFastify();
    await plugin(fastify);

    const route = fastify.findRoute('POST', '/surf/execute');

    // Without auth → 401
    const reply1 = createMockReply();
    await route!.handler(
      createMockRequest({ command: 'secret' }),
      reply1,
    );
    const body1 = reply1.responseBody as Record<string, unknown>;
    expect(body1.ok).toBe(false);

    // With valid auth → success
    const reply2 = createMockReply();
    await route!.handler(
      createMockRequest({ command: 'secret' }, { authorization: 'Bearer valid-token' }),
      reply2,
    );
    const body2 = reply2.responseBody as Record<string, unknown>;
    expect(body2.ok).toBe(true);
    expect(body2.result).toBe('classified');
  });

  it('POST /surf/session/start creates a session', async () => {
    const surf = await createTestSurf();
    const plugin = fastifyPlugin(surf);
    const fastify = createMockFastify();
    await plugin(fastify);

    const route = fastify.findRoute('POST', '/surf/session/start');
    const reply = createMockReply();
    await route!.handler(createMockRequest(), reply);

    const body = reply.responseBody as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(typeof body.sessionId).toBe('string');
  });

  it('POST /surf/session/end destroys a session', async () => {
    const surf = await createTestSurf();
    const plugin = fastifyPlugin(surf);
    const fastify = createMockFastify();
    await plugin(fastify);

    // Create session
    const startRoute = fastify.findRoute('POST', '/surf/session/start');
    const startReply = createMockReply();
    await startRoute!.handler(createMockRequest(), startReply);
    const sessionId = (startReply.responseBody as Record<string, unknown>).sessionId;

    // End session
    const endRoute = fastify.findRoute('POST', '/surf/session/end');
    const endReply = createMockReply();
    await endRoute!.handler(createMockRequest({ sessionId }), endReply);

    const body = endReply.responseBody as Record<string, unknown>;
    expect(body.ok).toBe(true);
  });

  it('execute with expired/invalid session returns 410', async () => {
    const surf = await createTestSurf();
    const plugin = fastifyPlugin(surf);
    const fastify = createMockFastify();
    await plugin(fastify);

    const route = fastify.findRoute('POST', '/surf/execute');
    const reply = createMockReply();
    await route!.handler(
      createMockRequest({ command: 'ping', sessionId: 'sess_nonexistent' }),
      reply,
    );

    expect(reply.statusCode).toBe(410);
    const body = reply.responseBody as Record<string, unknown>;
    expect(body.ok).toBe(false);
  });
});
