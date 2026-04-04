import type { SurfInstance } from '../surf.js';
import type {
  ExecuteRequest,
  PipelineRequest,
  SurfResponse,
} from '../types.js';
import { executePipeline } from '../transport/pipeline.js';
import { createSseWriter, chunkEvent, doneEvent, errorEvent, type SseCompatibleResponse } from '../transport/sse.js';
import { assertNotPromise } from '../errors.js';
import { resolveCorsHeaders, resolveCorsPreflightHeaders } from '../cors.js';
import { getErrorStatus } from '../http-status.js';

// ─── Minimal interfaces for Fastify types (no hard dependency) ─────────

/** Minimal shape of a Fastify request — only properties we actually access. */
interface FastifyRequest {
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

/** Minimal shape of a Fastify reply — only methods we actually call. */
interface FastifyReply {
  code(statusCode: number): FastifyReply;
  header(key: string, value: string): FastifyReply;
  headers(values: Record<string, string>): FastifyReply;
  send(payload?: unknown): FastifyReply;
  raw: SseCompatibleResponse;
}

/** Route handler signature used by the Fastify router. */
type FastifyRouteHandler = (req: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | void>;

/** Minimal shape of a Fastify instance — only methods we actually call. */
interface FastifyInstance {
  options(path: string, handler: FastifyRouteHandler): void;
  get(path: string, handler: FastifyRouteHandler): void;
  post(path: string, handler: FastifyRouteHandler): void;
  /** Register a custom content-type parser. */
  addContentTypeParser?: (
    contentType: string,
    opts: { parseAs: string },
    parser: (req: unknown, body: string, done: (err: Error | null, result?: unknown) => void) => void,
  ) => void;
}

// ────────────────────────────────────────────────────────────────────────

/**
 * Creates a Fastify plugin that mounts all Surf HTTP routes.
 *
 * Usage:
 * ```ts
 * import Fastify from 'fastify'
 * import { createSurf } from '@surfjs/core'
 * import { fastifyPlugin } from '@surfjs/core/fastify'
 *
 * const surf = await createSurf({ ... })
 * const app = Fastify()
 * app.register(fastifyPlugin(surf))
 * ```
 */
export function fastifyPlugin(surf: SurfInstance) {
  assertNotPromise(surf);
  const registry = surf.commands;
  const sessions = surf.sessions;

  function extractAuth(headers: Record<string, string | string[] | undefined>): string | undefined {
    const auth = headers['authorization'] ?? headers['Authorization'];
    const val = Array.isArray(auth) ? auth[0] : auth;
    if (!val) return undefined;
    return val.startsWith('Bearer ') ? val.slice(7) : val;
  }

  function extractIp(headers: Record<string, string | string[] | undefined>): string | undefined {
    const fwd = headers['x-forwarded-for'];
    const val = Array.isArray(fwd) ? fwd[0] : fwd;
    if (val) return val.split(',')[0]?.trim();
    const real = headers['x-real-ip'];
    return Array.isArray(real) ? real[0] : real;
  }

  // getErrorStatus is now imported from '../http-status.js'

  function getOrigin(headers: Record<string, string | string[] | undefined>): string | undefined {
    const val = headers['origin'] ?? headers['Origin'];
    return Array.isArray(val) ? val[0] : val;
  }

  function getCorsHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
    return resolveCorsHeaders(surf.corsConfig, getOrigin(headers));
  }

  return async function surfPlugin(fastify: FastifyInstance) {
    // ─── Empty-body-safe JSON parser ───────────────────────────────────
    // Fastify rejects empty JSON bodies (FST_ERR_CTP_EMPTY_JSON_BODY) by default.
    // Override the parser to treat empty bodies as `{}` since some Surf routes
    // (e.g. session/start) don't require a body.
    if (fastify.addContentTypeParser) {
      fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
        try {
          const trimmed = body.trim();
          done(null, trimmed === '' ? {} : JSON.parse(trimmed));
        } catch (e) {
          done(e instanceof Error ? e : new Error('Invalid JSON body'));
        }
      });
    }

    // ─── OPTIONS (CORS preflight) ──────────────────────────────────────
    const optionsRoutes = [
      '/.well-known/surf.json',
      '/surf/execute',
      '/surf/pipeline',
      '/surf/session/start',
      '/surf/session/end',
    ];
    for (const route of optionsRoutes) {
      fastify.options(route, async (req: FastifyRequest, reply: FastifyReply) => {
        return reply.code(204).headers(resolveCorsPreflightHeaders(surf.corsConfig, getOrigin(req.headers))).send();
      });
    }

    // ─── GET /.well-known/surf.json ────────────────────────────────────
    fastify.get('/.well-known/surf.json', async (req: FastifyRequest, reply: FastifyReply) => {
      const token = extractAuth(req.headers);
      const manifestData = await surf.manifestForToken(token);
      const etag = `"${manifestData.checksum}"`;

      if (req.headers['if-none-match'] === etag) {
        return reply.code(304).send();
      }

      let r = reply
        .header('Content-Type', 'application/json')
        .header('ETag', etag)
        .header('Cache-Control', 'public, max-age=300');
      for (const [k, v] of Object.entries(getCorsHeaders(req.headers))) {
        r = r.header(k, v);
      }
      return r.send(manifestData);
    });

    // ─── POST /surf/execute ────────────────────────────────────────────
    fastify.post('/surf/execute', async (req: FastifyRequest, reply: FastifyReply) => {
      const body = req.body as ExecuteRequest;

      if (!body?.command || typeof body.command !== 'string') {
        return reply.code(400).send({
          ok: false,
          error: { code: 'INVALID_PARAMS', message: 'Missing command field' },
        });
      }

      const auth = extractAuth(req.headers);
      const ip = extractIp(req.headers);
      let sessionState: Record<string, unknown> | undefined;

      if (body.sessionId) {
        const session = await sessions.get(body.sessionId);
        if (!session) {
          return reply.code(410).send({ ok: false, error: { code: 'SESSION_EXPIRED', message: `Session "${body.sessionId}" has expired or been destroyed` } });
        }
        sessionState = session.state;
      }

      const command = registry.get(body.command);
      const wantsStream = body.stream === true && command?.stream === true;

      if (wantsStream) {
        // SSE streaming — write directly to the raw Node response
        const raw = reply.raw;
        const sse = createSseWriter(raw, getCorsHeaders(req.headers));

        const context = {
          sessionId: body.sessionId,
          auth,
          ip,
          state: sessionState,
          requestId: body.requestId,
          emit: (data: unknown) => {
            sse.write(chunkEvent(data));
          },
        };

        try {
          const response: SurfResponse = await registry.execute(body.command, body.params, context);
          if (response.ok) {
            sse.write(doneEvent(response.result));
          } else {
            sse.write(errorEvent(response.error.code, response.error.message));
          }
        } catch (e) {
          sse.write(errorEvent('INTERNAL_ERROR', e instanceof Error ? e.message : 'Unknown error'));
        } finally {
          sse.close();
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
      const headers: Record<string, string> = {
        ...getCorsHeaders(req.headers),
      };

      if (!response.ok && response.error.code === 'RATE_LIMITED') {
        const retryMs = (response.error.details?.['retryAfterMs'] as number | undefined) ?? 0;
        headers['Retry-After'] = String(Math.ceil(retryMs / 1000));
      }

      let r = reply.code(statusCode);
      for (const [k, v] of Object.entries(headers)) {
        r = r.header(k, v);
      }
      // Strip internal state from response
      const { state: _state, ...clientResponse } = response as unknown as Record<string, unknown>;
      return r.send(clientResponse);
    });

    // ─── POST /surf/pipeline ───────────────────────────────────────────
    fastify.post('/surf/pipeline', async (req: FastifyRequest, reply: FastifyReply) => {
      const body = req.body as PipelineRequest;
      const auth = extractAuth(req.headers);

      try {
        const result = await executePipeline(
          body,
          registry as Parameters<typeof executePipeline>[1],
          sessions as Parameters<typeof executePipeline>[2],
          auth,
        );
        let rr = reply;
        for (const [k, v] of Object.entries(getCorsHeaders(req.headers))) {
          rr = rr.header(k, v);
        }
        return rr.send(result);
      } catch (e) {
        return reply.code(500).send({
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: e instanceof Error ? e.message : 'Unknown error' },
        });
      }
    });

    // ─── POST /surf/session/start ──────────────────────────────────────
    fastify.post('/surf/session/start', async (req: FastifyRequest, reply: FastifyReply) => {
      const session = await sessions.create();
      let r = reply;
      for (const [k, v] of Object.entries(getCorsHeaders(req.headers))) {
        r = r.header(k, v);
      }
      return r.send({ ok: true, sessionId: session.id });
    });

    // ─── POST /surf/session/end ────────────────────────────────────────
    fastify.post('/surf/session/end', async (req: FastifyRequest, reply: FastifyReply) => {
      const body = req.body as { sessionId?: string };
      if (body?.sessionId) {
        await sessions.destroy(body.sessionId);
      }
      let r = reply;
      for (const [k, v] of Object.entries(getCorsHeaders(req.headers))) {
        r = r.header(k, v);
      }
      return r.send({ ok: true });
    });
  };
}
