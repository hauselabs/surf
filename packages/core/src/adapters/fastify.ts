import type { SurfInstance } from '../surf.js';
import type {
  ExecuteRequest,
  PipelineRequest,
  SurfResponse,
} from '../types.js';
import { executePipeline } from '../transport/pipeline.js';
import { createSseWriter, chunkEvent, doneEvent, errorEvent } from '../transport/sse.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Creates a Fastify plugin that mounts all Surf HTTP routes.
 *
 * Usage:
 * ```ts
 * import Fastify from 'fastify'
 * import { createSurf } from '@surfjs/core'
 * import { fastifyPlugin } from '@surfjs/core/fastify'
 *
 * const surf = createSurf({ ... })
 * const app = Fastify()
 * app.register(fastifyPlugin(surf))
 * ```
 */
export function fastifyPlugin(surf: SurfInstance) {
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

  return async function surfPlugin(fastify: any) {
    // ─── GET /.well-known/surf.json ────────────────────────────────────
    fastify.get('/.well-known/surf.json', async (req: any, reply: any) => {
      const token = extractAuth(req.headers as Record<string, string | string[] | undefined>);
      const manifestData = await surf.manifestForToken(token);
      const etag = `"${manifestData.checksum}"`;

      if (req.headers['if-none-match'] === etag) {
        return reply.code(304).send();
      }

      return reply
        .header('Content-Type', 'application/json')
        .header('ETag', etag)
        .header('Cache-Control', 'public, max-age=300')
        .header('Access-Control-Allow-Origin', '*')
        .send(manifestData);
    });

    // ─── POST /surf/execute ────────────────────────────────────────────
    fastify.post('/surf/execute', async (req: any, reply: any) => {
      const body = req.body as ExecuteRequest;

      if (!body?.command || typeof body.command !== 'string') {
        return reply.code(400).send({
          ok: false,
          error: { code: 'INVALID_PARAMS', message: 'Missing command field' },
        });
      }

      const auth = extractAuth(req.headers as Record<string, string | string[] | undefined>);
      const ip = extractIp(req.headers as Record<string, string | string[] | undefined>);
      let sessionState: Record<string, unknown> | undefined;

      if (body.sessionId) {
        const session = await sessions.get(body.sessionId);
        if (session) sessionState = session.state;
      }

      const command = registry.get(body.command);
      const wantsStream = body.stream === true && command?.stream === true;

      if (wantsStream) {
        // SSE streaming — write directly to the raw Node response
        const raw = reply.raw;
        const sse = createSseWriter(raw);

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
        'Access-Control-Allow-Origin': '*',
      };

      if (!response.ok && response.error.code === 'RATE_LIMITED') {
        const retryMs = (response.error.details?.['retryAfterMs'] as number | undefined) ?? 0;
        headers['Retry-After'] = String(Math.ceil(retryMs / 1000));
      }

      let r = reply.code(statusCode);
      for (const [k, v] of Object.entries(headers)) {
        r = r.header(k, v);
      }
      return r.send(response);
    });

    // ─── POST /surf/pipeline ───────────────────────────────────────────
    fastify.post('/surf/pipeline', async (req: any, reply: any) => {
      const body = req.body as PipelineRequest;
      const auth = extractAuth(req.headers as Record<string, string | string[] | undefined>);

      try {
        const result = await executePipeline(
          body,
          registry as Parameters<typeof executePipeline>[1],
          sessions as Parameters<typeof executePipeline>[2],
          auth,
        );
        return reply
          .header('Access-Control-Allow-Origin', '*')
          .send(result);
      } catch (e) {
        return reply.code(500).send({
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: e instanceof Error ? e.message : 'Unknown error' },
        });
      }
    });

    // ─── POST /surf/session/start ──────────────────────────────────────
    fastify.post('/surf/session/start', async (_req: any, reply: any) => {
      const session = await sessions.create();
      return reply
        .header('Access-Control-Allow-Origin', '*')
        .send({ ok: true, sessionId: session.id });
    });

    // ─── POST /surf/session/end ────────────────────────────────────────
    fastify.post('/surf/session/end', async (req: any, reply: any) => {
      const body = req.body as { sessionId?: string };
      if (body?.sessionId) {
        await sessions.destroy(body.sessionId);
      }
      return reply
        .header('Access-Control-Allow-Origin', '*')
        .send({ ok: true });
    });
  };
}
