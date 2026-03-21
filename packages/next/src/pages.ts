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
 * Minimal Next.js Pages API request type.
 * Avoids importing `next` at runtime for portability.
 */
interface PagesApiRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
  body?: unknown;
}

/**
 * Minimal Next.js Pages API response type.
 * Avoids importing `next` at runtime for portability.
 */
interface PagesApiResponse {
  setHeader(name: string, value: string | number): PagesApiResponse;
  status(code: number): PagesApiResponse;
  json(body: unknown): void;
  end(chunk?: string): void;
  write(chunk: string): boolean;
  writeHead(statusCode: number, headers?: Record<string, string>): void;
  flushHeaders?(): void;
}

function headerValue(val: string | string[] | undefined): string | undefined {
  if (Array.isArray(val)) return val[0];
  return val;
}

/**
 * Creates a Pages Router API handler for Surf.js.
 *
 * Returns a single handler for use in a Next.js catch-all API route:
 * `pages/api/surf/[...slug].ts`
 *
 * @example
 * ```ts
 * // pages/api/surf/[...slug].ts
 * import { createSurf } from '@surfjs/core';
 * import { createSurfApiHandler } from '@surfjs/next/pages';
 *
 * const surf = createSurf({ name: 'my-app', commands: { ... } });
 * export default createSurfApiHandler(surf);
 * ```
 *
 * @example
 * ```ts
 * // Disable body parsing for streaming support
 * export const config = { api: { bodyParser: true } };
 * export default createSurfApiHandler(surf);
 * ```
 *
 * @param surf - A `SurfInstance` created via `createSurf()`
 * @returns A Next.js Pages API handler function
 */
export function createSurfApiHandler(
  surf: SurfInstance,
): (req: PagesApiRequest, res: PagesApiResponse) => Promise<void> {
  const registry = surf.commands;
  const sessions = surf.sessions;

  function resolveRoute(query: Record<string, string | string[] | undefined>): string {
    const slugParam = query['slug'];
    if (!slugParam) return '/';
    const parts = Array.isArray(slugParam) ? slugParam : [slugParam];
    return '/' + parts.join('/');
  }

  function sendJson(res: PagesApiResponse, status: number, body: unknown, extraHeaders?: Record<string, string>): void {
    for (const [k, v] of Object.entries(CORS_HEADERS)) {
      res.setHeader(k, v);
    }
    if (extraHeaders) {
      for (const [k, v] of Object.entries(extraHeaders)) {
        res.setHeader(k, v);
      }
    }
    res.status(status).json(body);
  }

  return async function surfApiHandler(req: PagesApiRequest, res: PagesApiResponse): Promise<void> {
    const route = resolveRoute(req.query);
    const method = (req.method ?? 'GET').toUpperCase();

    // ─── GET /.well-known/surf.json ──────────────────────────────────
    if (method === 'GET' && (route === '/.well-known/surf.json' || route === '/')) {
      const manifestData = surf.manifest();
      const etag = `"${manifestData.checksum}"`;

      if (headerValue(req.headers['if-none-match']) === etag) {
        res.setHeader('ETag', etag);
        res.setHeader('Cache-Control', 'public, max-age=300');
        for (const [k, v] of Object.entries(CORS_HEADERS)) {
          res.setHeader(k, v);
        }
        res.status(304).end();
        return;
      }

      sendJson(res, 200, manifestData, {
        'ETag': etag,
        'Cache-Control': 'public, max-age=300',
      });
      return;
    }

    // Only POST beyond this point
    if (method !== 'POST') {
      sendJson(res, 405, { ok: false, error: { code: 'NOT_SUPPORTED', message: `Method ${method} not allowed` } });
      return;
    }

    const auth = extractAuth(headerValue(req.headers['authorization']));
    const ip = extractIp(
      headerValue(req.headers['x-forwarded-for']),
      headerValue(req.headers['x-real-ip']),
    );

    // ─── POST /surf/execute ──────────────────────────────────────────
    if (route === '/surf/execute' || route === '/execute') {
      const body = req.body as ExecuteRequest | undefined;

      if (!body?.command || typeof body.command !== 'string') {
        sendJson(res, 400, { ok: false, error: { code: 'INVALID_PARAMS', message: 'Missing command field' } });
        return;
      }

      let sessionState: Record<string, unknown> | undefined;
      if (body.sessionId) {
        const session = await sessions.get(body.sessionId);
        if (session) sessionState = session.state;
      }

      const command = registry.get(body.command);
      const wantsStream = body.stream === true && command?.stream === true;

      if (wantsStream) {
        // SSE streaming via Node.js response
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });
        if (res.flushHeaders) res.flushHeaders();

        const write = (data: unknown) => {
          res.write(`data: ${JSON.stringify(data)}\n\n`);
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
            error: { code: 'INTERNAL_ERROR', message: e instanceof Error ? e.message : 'Unknown error' },
          });
        } finally {
          res.end();
        }
        return;
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
      const extraHeaders: Record<string, string> = {};

      if (!response.ok && response.error.code === 'RATE_LIMITED') {
        const retryMs = (response.error.details?.['retryAfterMs'] as number | undefined) ?? 0;
        extraHeaders['Retry-After'] = String(Math.ceil(retryMs / 1000));
      }

      sendJson(res, statusCode, response, extraHeaders);
      return;
    }

    // ─── POST /surf/pipeline ─────────────────────────────────────────
    if (route === '/surf/pipeline' || route === '/pipeline') {
      const body = req.body as PipelineRequest | undefined;

      if (!body) {
        sendJson(res, 400, { ok: false, error: { code: 'INVALID_PARAMS', message: 'Missing request body' } });
        return;
      }

      try {
        const result = await executePipeline(
          body,
          registry as Parameters<typeof executePipeline>[1],
          sessions as Parameters<typeof executePipeline>[2],
          auth,
        );
        sendJson(res, 200, result);
      } catch (e) {
        sendJson(res, 500, {
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: e instanceof Error ? e.message : 'Unknown error' },
        });
      }
      return;
    }

    // ─── POST /surf/session/start ────────────────────────────────────
    if (route === '/surf/session/start' || route === '/session/start') {
      const session = await sessions.create();
      sendJson(res, 200, { ok: true, sessionId: session.id });
      return;
    }

    // ─── POST /surf/session/end ──────────────────────────────────────
    if (route === '/surf/session/end' || route === '/session/end') {
      const body = req.body as { sessionId?: string } | undefined;
      if (body?.sessionId) {
        await sessions.destroy(body.sessionId);
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: `Unknown route: POST ${route}` } });
  };
}

export { getErrorStatus, extractAuth, extractIp } from './shared.js';
