import type { SurfInstance } from '../surf.js';
import type {
  ExecuteRequest,
  PipelineRequest,
  SurfResponse,
} from '../types.js';
import { executePipeline } from '../transport/pipeline.js';
import { assertNotPromise } from '../errors.js';

// ─── Minimal interfaces for Hono types (no hard dependency) ────────────

/** Minimal shape of a Hono request object — only methods we actually call. */
interface HonoRequest {
  json(): Promise<unknown>;
  header(name: string): string | undefined;
}

/** Minimal shape of a Hono context — only methods/properties we actually call. */
interface HonoContext {
  req: HonoRequest;
  json(data: unknown, status?: number, headers?: Record<string, string>): Response;
  body(data: null, status?: number, headers?: Record<string, string>): Response;
}

/** Route handler signature used by the Hono router. */
type HonoHandler = (c: HonoContext) => Response | Promise<Response>;

/** Minimal shape of a Hono app instance — only methods we actually call. */
interface HonoApp {
  options(path: string, handler: HonoHandler): void;
  get(path: string, handler: HonoHandler): void;
  post(path: string, handler: HonoHandler): void;
  fetch(request: Request, env?: unknown, ctx?: unknown): Response | Promise<Response>;
}

/** Constructor for a Hono app. */
type HonoConstructor = new () => HonoApp;

// ─── Hono module shape for dynamic import ──────────────────────────────

interface HonoModule {
  Hono: HonoConstructor;
}

// ────────────────────────────────────────────────────────────────────────

/**
 * Creates a Hono sub-app that mounts all Surf routes.
 *
 * Usage:
 * ```ts
 * import { Hono } from 'hono'
 * import { createSurf } from '@surfjs/core'
 * import { honoApp } from '@surfjs/core/hono'
 *
 * const surf = createSurf({ ... })
 * const app = new Hono()
 * app.route('/', honoApp(surf))
 * ```
 */
function buildHonoApp(surf: SurfInstance, Hono: HonoConstructor): HonoApp {
  assertNotPromise(surf);
  const app = new Hono();

  const registry = surf.commands;
  const sessions = surf.sessions;

  function extractAuth(c: HonoContext): string | undefined {
    const auth = c.req.header('authorization');
    if (!auth) return undefined;
    return auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  }

  function extractIp(c: HonoContext): string | undefined {
    const fwd = c.req.header('x-forwarded-for');
    if (fwd) return fwd.split(',')[0]?.trim();
    return c.req.header('x-real-ip');
  }

  function getErrorStatus(code: string): number {
    switch (code) {
      case 'UNKNOWN_COMMAND': return 404;
      case 'INVALID_PARAMS': return 400;
      case 'AUTH_REQUIRED': return 401;
      case 'AUTH_FAILED': return 403;
      case 'SESSION_EXPIRED': return 410;
      case 'RATE_LIMITED': return 429;
      case 'NOT_SUPPORTED': return 501;
      default: return 500;
    }
  }

  // ─── OPTIONS (CORS preflight) ────────────────────────────────────────
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  const optionsRoutes = [
    '/.well-known/surf.json',
    '/surf/execute',
    '/surf/pipeline',
    '/surf/session/start',
    '/surf/session/end',
  ];
  for (const route of optionsRoutes) {
    app.options(route, (c: HonoContext) => {
      return c.body(null, 204, corsHeaders);
    });
  }

  // ─── GET /.well-known/surf.json ──────────────────────────────────────
  app.get('/.well-known/surf.json', async (c: HonoContext) => {
    const token = extractAuth(c);
    const manifestData = await surf.manifestForToken(token);
    const etag = `"${manifestData.checksum}"`;

    if (c.req.header('if-none-match') === etag) {
      return c.body(null, 304, {
        'ETag': etag,
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*',
      });
    }

    return c.json(manifestData, 200, {
      'ETag': etag,
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    });
  });

  // ─── POST /surf/execute ──────────────────────────────────────────────
  app.post('/surf/execute', async (c: HonoContext) => {
    let body: ExecuteRequest;
    try {
      body = await c.req.json() as ExecuteRequest;
    } catch {
      return c.json(
        { ok: false, error: { code: 'INVALID_PARAMS', message: 'Invalid JSON body' } },
        400,
        { 'Access-Control-Allow-Origin': '*' },
      );
    }

    if (!body?.command || typeof body.command !== 'string') {
      return c.json(
        { ok: false, error: { code: 'INVALID_PARAMS', message: 'Missing command field' } },
        400,
        { 'Access-Control-Allow-Origin': '*' },
      );
    }

    const auth = extractAuth(c);
    const ip = extractIp(c);
    let sessionState: Record<string, unknown> | undefined;

    if (body.sessionId) {
      const session = await sessions.get(body.sessionId);
      if (!session) {
        return c.json({ ok: false, error: { code: 'SESSION_EXPIRED', message: `Session "${body.sessionId}" has expired or been destroyed` } }, 410);
      }
      sessionState = session.state;
    }

    const command = registry.get(body.command);
    const wantsStream = body.stream === true && command?.stream === true;

    if (wantsStream) {
      // SSE streaming via ReadableStream
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          const write = (data: unknown) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          };

          const context = {
            sessionId: body.sessionId,
            auth,
            ip,
            state: sessionState,
            requestId: body.requestId,
            emit: (data: unknown) => {
              write({ type: 'chunk', data });
            },
          };

          try {
            const response: SurfResponse = await registry.execute(body.command, body.params, context);
            if (response.ok) {
              write({ type: 'done', result: response.result });
            } else {
              write({ type: 'error', error: { code: response.error.code, message: response.error.message } });
            }
          } catch (e) {
            write({ type: 'error', error: { code: 'INTERNAL_ERROR', message: e instanceof Error ? e.message : 'Unknown error' } });
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Standard JSON response
    const response: SurfResponse = await registry.execute(body.command, body.params, {
      sessionId: body.sessionId,
      auth,
      ip,
      state: sessionState,
      requestId: body.requestId,
    });

    if (body.sessionId && response.ok && response.state) {
      await sessions.update(body.sessionId, response.state);
    }

    const statusCode = response.ok ? 200 : getErrorStatus(response.error.code);
    const headers: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
    };

    if (!response.ok && response.error.code === 'RATE_LIMITED') {
      const retryMs = (response.error.details?.['retryAfterMs'] as number | undefined) ?? 0;
      headers['Retry-After'] = String(Math.ceil(retryMs / 1000));
    }

    // Strip internal state from response
    const { state: _state, ...clientResponse } = response as unknown as Record<string, unknown>;
    return c.json(clientResponse, statusCode, headers);
  });

  // ─── POST /surf/pipeline ─────────────────────────────────────────────
  app.post('/surf/pipeline', async (c: HonoContext) => {
    let body: PipelineRequest;
    try {
      body = await c.req.json() as PipelineRequest;
    } catch {
      return c.json(
        { ok: false, error: { code: 'INVALID_PARAMS', message: 'Invalid JSON body' } },
        400,
      );
    }

    const auth = extractAuth(c);

    try {
      const result = await executePipeline(
        body,
        registry as Parameters<typeof executePipeline>[1],
        sessions as Parameters<typeof executePipeline>[2],
        auth,
      );
      return c.json(result, 200, { 'Access-Control-Allow-Origin': '*' });
    } catch (e) {
      return c.json(
        { ok: false, error: { code: 'INTERNAL_ERROR', message: e instanceof Error ? e.message : 'Unknown error' } },
        500,
      );
    }
  });

  // ─── POST /surf/session/start ────────────────────────────────────────
  app.post('/surf/session/start', async (c: HonoContext) => {
    const session = await sessions.create();
    return c.json({ ok: true, sessionId: session.id }, 200, {
      'Access-Control-Allow-Origin': '*',
    });
  });

  // ─── POST /surf/session/end ──────────────────────────────────────────
  app.post('/surf/session/end', async (c: HonoContext) => {
    const body = await c.req.json() as { sessionId?: string };
    if (body?.sessionId) {
      await sessions.destroy(body.sessionId);
    }
    return c.json({ ok: true }, 200, {
      'Access-Control-Allow-Origin': '*',
    });
  });

  return app;
}

/**
 * Creates a Hono sub-app that mounts all Surf routes.
 *
 * Usage:
 * ```ts
 * import { Hono } from 'hono'
 * import { createSurf } from '@surfjs/core'
 * import { honoApp } from '@surfjs/core/hono'
 *
 * const surf = createSurf({ ... })
 * const app = new Hono()
 * app.route('/', await honoApp(surf))
 * ```
 */
export async function honoApp(surf: SurfInstance): Promise<HonoApp> {
  // Dynamic import to avoid compile-time dependency on hono (works in both ESM and CJS)
  let Hono: HonoConstructor;
  try {
    const mod: HonoModule = await import('hono');
    Hono = mod.Hono;
  } catch {
    throw new Error('@surfjs/core: Hono adapter requires the "hono" package. Install it: pnpm add hono');
  }
  return buildHonoApp(surf, Hono);
}

/**
 * Synchronous variant — pass in your Hono constructor to avoid the dynamic import.
 * Useful for Cloudflare Workers and other environments where top-level await is awkward.
 *
 * Usage:
 * ```ts
 * import { Hono } from 'hono'
 * import { createSurf } from '@surfjs/core'
 * import { honoAppSync } from '@surfjs/core/hono'
 *
 * const surf = createSurf({ ... })
 * const app = new Hono()
 * app.route('/', honoAppSync(surf, Hono))
 * ```
 */
export function honoAppSync(surf: SurfInstance, HonoCtor: HonoConstructor): HonoApp {
  return buildHonoApp(surf, HonoCtor);
}

/**
 * Returns a Hono fetch handler for use as a standalone server or Cloudflare Worker.
 *
 * Usage:
 * ```ts
 * export default { fetch: honoMiddleware(surf) }
 * ```
 */
export async function honoMiddleware(surf: SurfInstance): Promise<(request: Request, env?: unknown, ctx?: unknown) => Response | Promise<Response>> {
  const app = await honoApp(surf);
  return (request: Request, env?: unknown, ctx?: unknown) => app.fetch(request, env, ctx);
}
