import type { SurfInstance } from '@surfjs/core';
import type {
  ExecuteRequest,
  PipelineRequest,
  SurfResponse,
} from '@surfjs/core';
import { executePipeline } from '@surfjs/core';
import {
  getErrorStatus,
  extractAuth,
  extractIp,
  CORS_HEADERS,
} from './shared.js';

/**
 * Next.js App Router request type (web-standard Request with nextUrl).
 * We use the global `Request` type for edge compatibility
 * and avoid importing Next.js types at runtime.
 */
type NextRequest = Request & { nextUrl?: URL };

/**
 * Creates App Router route handlers for Surf.js.
 *
 * Returns `GET` and `POST` handlers for use in a Next.js catch-all route file:
 * `app/api/surf/[...slug]/route.ts`
 *
 * @example
 * ```ts
 * // app/api/surf/[...slug]/route.ts
 * import { createSurf } from '@surfjs/core';
 * import { createSurfRouteHandler } from '@surfjs/next';
 *
 * const surf = createSurf({ name: 'my-app', commands: { ... } });
 * export const { GET, POST } = createSurfRouteHandler(surf);
 * ```
 *
 * @example
 * ```ts
 * // With a custom base path
 * export const { GET, POST } = createSurfRouteHandler(surf, {
 *   basePath: '/api/surf',
 * });
 * ```
 *
 * @param surf - A `SurfInstance` created via `createSurf()`
 * @param options - Optional configuration
 * @returns An object with `GET` and `POST` handlers
 */
export function createSurfRouteHandler(
  surf: SurfInstance,
  options: { basePath?: string } = {},
): {
  GET: (request: Request, context: { params: Promise<{ slug?: string[] }> }) => Promise<Response>;
  POST: (request: Request, context: { params: Promise<{ slug?: string[] }> }) => Promise<Response>;
} {
  const registry = surf.commands;
  const sessions = surf.sessions;
  const basePath = options.basePath ?? '/api/surf';

  function getPathname(request: Request): string {
    const req = request as NextRequest;
    if (req.nextUrl) return req.nextUrl.pathname;
    return new URL(request.url).pathname;
  }

  function resolveRoute(request: Request, slug: string[] | undefined): string {
    if (slug && slug.length > 0) {
      return '/' + slug.join('/');
    }
    // Fallback: extract from pathname
    const pathname = getPathname(request);
    const stripped = pathname.startsWith(basePath)
      ? pathname.slice(basePath.length)
      : pathname;
    return stripped || '/';
  }

  function jsonResponse(body: unknown, status: number, extraHeaders?: Record<string, string>): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS,
        ...extraHeaders,
      },
    });
  }

  // ─── GET handler ─────────────────────────────────────────────────────
  async function GET(
    request: Request,
    context: { params: Promise<{ slug?: string[] }> },
  ): Promise<Response> {
    const { slug } = await context.params;
    const route = resolveRoute(request, slug);

    // /.well-known/surf.json
    if (route === '/.well-known/surf.json' || route === '/') {
      const manifestData = surf.manifest();
      if (!manifestData) {
        return new Response(
          JSON.stringify({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Surf not initialized' } }),
          { status: 503, headers: { 'Content-Type': 'application/json' } },
        );
      }
      const etag = `"${manifestData.checksum}"`;

      if (request.headers.get('if-none-match') === etag) {
        return new Response(null, {
          status: 304,
          headers: { 'ETag': etag, 'Cache-Control': 'public, max-age=300', ...CORS_HEADERS },
        });
      }

      return jsonResponse(manifestData, 200, {
        'ETag': etag,
        'Cache-Control': 'public, max-age=300',
      });
    }

    return jsonResponse(
      { ok: false, error: { code: 'NOT_FOUND', message: `Unknown route: GET ${route}` } },
      404,
    );
  }

  // ─── POST handler ────────────────────────────────────────────────────
  async function POST(
    request: Request,
    context: { params: Promise<{ slug?: string[] }> },
  ): Promise<Response> {
    const { slug } = await context.params;
    const route = resolveRoute(request, slug);
    const auth = extractAuth(request.headers.get('authorization'));
    const ip = extractIp(
      request.headers.get('x-forwarded-for'),
      request.headers.get('x-real-ip'),
    );

    // ─── POST /surf/execute ──────────────────────────────────────────
    if (route === '/surf/execute' || route === '/execute') {
      let body: ExecuteRequest;
      try {
        body = await request.json() as ExecuteRequest;
      } catch {
        return jsonResponse(
          { ok: false, error: { code: 'INVALID_PARAMS', message: 'Invalid JSON body' } },
          400,
        );
      }

      if (!body?.command || typeof body.command !== 'string') {
        return jsonResponse(
          { ok: false, error: { code: 'INVALID_PARAMS', message: 'Missing command field' } },
          400,
        );
      }

      let sessionState: Record<string, unknown> | undefined;
      if (body.sessionId) {
        const session = await sessions.get(body.sessionId);
        if (session) sessionState = session.state;
      }

      const command = registry.get(body.command);
      const wantsStream = body.stream === true && command?.stream === true;

      if (wantsStream) {
        // SSE streaming via ReadableStream (edge-compatible)
        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            const write = (data: unknown) => {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            };

            const sseContext = {
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
              const response: SurfResponse = await registry.execute(body.command, body.params, sseContext);
              if (response.ok) {
                write({ type: 'done', result: response.result });
              } else {
                write({ type: 'error', error: { code: response.error.code, message: response.error.message } });
              }
            } catch (e) {
              write({
                type: 'error',
                error: {
                  code: 'INTERNAL_ERROR',
                  message: e instanceof Error ? e.message : 'Unknown error',
                },
              });
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
            ...CORS_HEADERS,
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
      const headers: Record<string, string> = {};

      if (!response.ok && response.error.code === 'RATE_LIMITED') {
        const retryMs = (response.error.details?.['retryAfterMs'] as number | undefined) ?? 0;
        headers['Retry-After'] = String(Math.ceil(retryMs / 1000));
      }

      return jsonResponse(response, statusCode, headers);
    }

    // ─── POST /surf/pipeline ─────────────────────────────────────────
    if (route === '/surf/pipeline' || route === '/pipeline') {
      let body: PipelineRequest;
      try {
        body = await request.json() as PipelineRequest;
      } catch {
        return jsonResponse(
          { ok: false, error: { code: 'INVALID_PARAMS', message: 'Invalid JSON body' } },
          400,
        );
      }

      try {
        const result = await executePipeline(
          body,
          registry as Parameters<typeof executePipeline>[1],
          sessions as Parameters<typeof executePipeline>[2],
          auth,
        );
        return jsonResponse(result, 200);
      } catch (e) {
        return jsonResponse(
          {
            ok: false,
            error: { code: 'INTERNAL_ERROR', message: e instanceof Error ? e.message : 'Unknown error' },
          },
          500,
        );
      }
    }

    // ─── POST /surf/session/start ────────────────────────────────────
    if (route === '/surf/session/start' || route === '/session/start') {
      const session = await sessions.create();
      return jsonResponse({ ok: true, sessionId: session.id }, 200);
    }

    // ─── POST /surf/session/end ──────────────────────────────────────
    if (route === '/surf/session/end' || route === '/session/end') {
      try {
        const body = await request.json() as { sessionId?: string };
        if (body?.sessionId) {
          await sessions.destroy(body.sessionId);
        }
      } catch {
        // Ignore parse errors for session end
      }
      return jsonResponse({ ok: true }, 200);
    }

    return jsonResponse(
      { ok: false, error: { code: 'NOT_FOUND', message: `Unknown route: POST ${route}` } },
      404,
    );
  }

  return { GET, POST };
}

export { getErrorStatus, extractAuth, extractIp } from './shared.js';
