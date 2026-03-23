import type { SurfInstance } from '../surf.js';
import type {
  ExecuteRequest,
  PipelineRequest,
  SurfResponse,
} from '../types.js';
import { executePipeline } from '../transport/pipeline.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

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
function buildHonoApp(surf: SurfInstance, Hono: new () => any): any {
  const app = new Hono();

  const registry = surf.commands;
  const sessions = surf.sessions;

  function extractAuth(c: any): string | undefined {
    const auth = c.req.header('authorization') as string | undefined;
    if (!auth) return undefined;
    return auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  }

  function extractIp(c: any): string | undefined {
    const fwd = c.req.header('x-forwarded-for') as string | undefined;
    if (fwd) return fwd.split(',')[0]?.trim();
    return c.req.header('x-real-ip') as string | undefined;
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
    app.options(route, (c: any) => {
      return c.body(null, 204, corsHeaders);
    });
  }

  // ─── GET /.well-known/surf.json ──────────────────────────────────────
  app.get('/.well-known/surf.json', async (c: any) => {
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
  app.post('/surf/execute', async (c: any) => {
    let body: ExecuteRequest;
    try {
      body = await c.req.json();
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
  app.post('/surf/pipeline', async (c: any) => {
    let body: PipelineRequest;
    try {
      body = await c.req.json();
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
  app.post('/surf/session/start', async (c: any) => {
    const session = await sessions.create();
    return c.json({ ok: true, sessionId: session.id }, 200, {
      'Access-Control-Allow-Origin': '*',
    });
  });

  // ─── POST /surf/session/end ──────────────────────────────────────────
  app.post('/surf/session/end', async (c: any) => {
    const body = await c.req.json();
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
export async function honoApp(surf: SurfInstance): Promise<any> {
  // Dynamic import to avoid compile-time dependency on hono (works in both ESM and CJS)
  let Hono: new () => any;
  try {
    const mod = await import('hono');
    Hono = (mod as any).Hono;
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
export function honoAppSync(surf: SurfInstance, HonoCtor: new () => any): any {
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
export async function honoMiddleware(surf: SurfInstance): Promise<(request: Request, env?: unknown, ctx?: unknown) => Promise<Response>> {
  const app = await honoApp(surf);
  return (request: Request, env?: unknown, ctx?: unknown) => app.fetch(request, env, ctx);
}
