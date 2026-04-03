import type { SurfManifest, ExecuteRequest, SurfResponse, HttpHandler } from '../types.js';
import type { CommandRegistry } from '../commands.js';
import type { InMemorySessionStore } from '../session.js';
import type { CorsConfig } from '../cors.js';
import { resolveCorsHeaders, resolveCorsPreflightHeaders } from '../cors.js';
import { executePipeline } from './pipeline.js';
import { createSseWriter, chunkEvent, doneEvent, errorEvent } from './sse.js';

interface HttpTransportOptions {
  manifest: SurfManifest;
  registry: CommandRegistry;
  sessions: InMemorySessionStore;
  getAuth: (headers: Record<string, string | string[] | undefined>) => string | undefined;
  corsConfig?: CorsConfig;
}

/**
 * Parse the request body from various server frameworks.
 */
async function parseBody(req: { body?: unknown } & NodeJS.ReadableStream): Promise<unknown> {
  if (req.body !== undefined && req.body !== null) {
    return req.body;
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf-8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function getHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const val = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(val) ? val[0] : val;
}

function extractAuth(headers: Record<string, string | string[] | undefined>): string | undefined {
  const auth = getHeader(headers, 'authorization');
  if (!auth) return undefined;
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return auth;
}

function extractIp(headers: Record<string, string | string[] | undefined>): string | undefined {
  const fwd = getHeader(headers, 'x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim();
  return getHeader(headers, 'x-real-ip');
}

/**
 * Creates the manifest HTTP handler (GET /.well-known/surf.json).
 * Supports ETag / 304 Not Modified.
 *
 * When `authedManifest` is provided, requests with a valid Bearer token
 * receive the authenticated manifest (which includes `auth: 'hidden'` commands).
 * The auth verifier is used to validate the token — if it fails or is absent,
 * the public manifest is served instead (no error).
 */
export function createManifestHandler(
  manifest: SurfManifest,
  authedManifest?: SurfManifest,
  authVerifier?: (token: string) => unknown,
  corsConfig?: CorsConfig,
): HttpHandler {
  const publicBody = JSON.stringify(manifest, null, 2);
  const publicEtag = `"${manifest.checksum}"`;
  const authedBody = authedManifest ? JSON.stringify(authedManifest, null, 2) : null;
  const authedEtag = authedManifest ? `"${authedManifest.checksum}"` : null;

  return async (req, res) => {
    const requestOrigin = getHeader(req.headers, 'origin');
    const cors = resolveCorsHeaders(corsConfig, requestOrigin);

    // Determine if this request should see hidden commands
    let useAuthed = false;
    if (authedBody && authedEtag) {
      const token = extractAuth(req.headers);
      if (token && authVerifier) {
        try {
          const result = await authVerifier(token);
          useAuthed = result !== false && result !== null && result !== undefined;
        } catch {
          // Invalid token — serve public manifest, no error
        }
      }
      // Fail-closed: no authVerifier = no hidden command exposure, regardless of token
    }

    const body = useAuthed ? authedBody! : publicBody;
    const etag = useAuthed ? authedEtag! : publicEtag;

    const ifNoneMatch = getHeader(req.headers, 'if-none-match');
    if (ifNoneMatch && ifNoneMatch === etag) {
      res.writeHead(304, {
        'ETag': etag,
        ...cors,
        'Cache-Control': useAuthed ? 'private, max-age=300' : 'public, max-age=300',
      });
      res.end();
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'application/json',
      ...cors,
      'Cache-Control': useAuthed ? 'private, max-age=300' : 'public, max-age=300',
      'ETag': etag,
    });
    res.end(body);
  };
}

/**
 * Creates the execute HTTP handler (POST /surf/execute).
 * Supports regular JSON responses and SSE streaming.
 */
export function createExecuteHandler(options: HttpTransportOptions): HttpHandler {
  const { registry, sessions, getAuth, corsConfig } = options;

  return async (req, res) => {
    const requestOrigin = getHeader(req.headers, 'origin');

    if (req.method === 'OPTIONS') {
      res.writeHead(204, resolveCorsPreflightHeaders(corsConfig, requestOrigin, 'POST, OPTIONS'));
      res.end();
      return;
    }

    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: { code: 'NOT_SUPPORTED', message: 'Method not allowed' } }));
      return;
    }

    let body: ExecuteRequest;
    try {
      body = (await parseBody(req as never)) as ExecuteRequest;
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: { code: 'INVALID_PARAMS', message: 'Invalid JSON body' } }));
      return;
    }

    if (!body.command || typeof body.command !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: { code: 'INVALID_PARAMS', message: 'Missing command field' } }));
      return;
    }

    const auth = getAuth(req.headers) ?? extractAuth(req.headers);
    const ip = extractIp(req.headers);
    let sessionState: Record<string, unknown> | undefined;
    if (body.sessionId) {
      const session = await sessions.get(body.sessionId);
      if (!session) {
        res.writeHead(410, { 'Content-Type': 'application/json', ...resolveCorsHeaders(corsConfig, requestOrigin) });
        res.end(JSON.stringify({ ok: false, error: { code: 'SESSION_EXPIRED', message: `Session "${body.sessionId}" has expired or been destroyed` } }));
        return;
      }
      sessionState = session.state;
    }

    const command = registry.get(body.command);

    // Reject browser-only commands called via HTTP
    if (command?.hints?.execution === 'browser') {
      res.writeHead(501, { 'Content-Type': 'application/json', ...resolveCorsHeaders(corsConfig, requestOrigin) });
      res.end(JSON.stringify({
        ok: false,
        error: {
          code: 'NOT_SUPPORTED',
          message: 'This command requires browser execution via window.surf',
        },
      }));
      return;
    }

    const wantsStream = body.stream === true && command?.stream === true;

    if (wantsStream) {
      // SSE streaming path
      const sseRes = res as unknown as {
        writeHead(status: number, headers?: Record<string, string>): void;
        write(data: string): boolean;
        end(body?: string): void;
        flushHeaders?: () => void;
      };
      const sse = createSseWriter(sseRes, resolveCorsHeaders(corsConfig, requestOrigin));

      const chunks: unknown[] = [];
      const context = {
        sessionId: body.sessionId,
        auth,
        ip,
        state: sessionState,
        requestId: body.requestId,
        emit: (data: unknown) => {
          chunks.push(data);
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

    // Standard JSON path
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
    const retryAfter = !response.ok && response.error.code === 'RATE_LIMITED'
      ? Math.ceil(((response.error.details?.['retryAfterMs'] as number | undefined) ?? 0) / 1000)
      : undefined;

    const cors = resolveCorsHeaders(corsConfig, requestOrigin);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...cors,
    };
    if (retryAfter !== undefined) {
      headers['Retry-After'] = String(retryAfter);
    }

    // Strip internal state from response — never expose server-side session state to clients
    const { state: _state, ...clientResponse } = response as unknown as Record<string, unknown>;

    try {
      const body = JSON.stringify(clientResponse);
      res.writeHead(statusCode, headers);
      res.end(body);
    } catch {
      res.writeHead(500, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to serialize response' } }));
    }
  };
}

/**
 * Creates session management handlers.
 */
export function createSessionHandlers(sessions: InMemorySessionStore, corsConfig?: CorsConfig): {
  start: HttpHandler;
  end: HttpHandler;
} {
  return {
    start: async (req, res) => {
      const cors = resolveCorsHeaders(corsConfig, getHeader(req.headers, 'origin'));
      const session = await sessions.create();
      res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify({ ok: true, sessionId: session.id }));
    },
    end: async (req, res) => {
      const cors = resolveCorsHeaders(corsConfig, getHeader(req.headers, 'origin'));
      const body = (await parseBody(req as never)) as { sessionId?: string };
      if (body.sessionId) {
        await sessions.destroy(body.sessionId);
      }
      res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify({ ok: true }));
    },
  };
}

/**
 * Creates a middleware that mounts all Surf HTTP handlers.
 */
export function createMiddleware(
  manifest: SurfManifest,
  executeHandler: HttpHandler,
  sessionHandlers: { start: HttpHandler; end: HttpHandler },
  pipelineOptions?: { registry: CommandRegistry; sessions: InMemorySessionStore; getAuth: (h: Record<string, string | string[] | undefined>) => string | undefined },
  manifestOptions?: { authedManifest?: SurfManifest; authVerifier?: (token: string) => unknown },
  corsConfig?: CorsConfig,
): HttpHandler {
  const manifestHandler = createManifestHandler(manifest, manifestOptions?.authedManifest, manifestOptions?.authVerifier, corsConfig);

  return async (req, res) => {
    const url = req.url ?? '';
    const path = url.split('?')[0];

    // Universal CORS preflight
    if (req.method === 'OPTIONS') {
      const requestOrigin = getHeader(req.headers, 'origin');
      res.writeHead(204, resolveCorsPreflightHeaders(corsConfig, requestOrigin));
      res.end();
      return;
    }

    if (path === '/.well-known/surf.json' && (req.method === 'GET' || req.method === 'HEAD')) {
      return manifestHandler(req, res);
    }

    if (path === '/surf/execute') {
      return executeHandler(req, res);
    }

    if (path === '/surf/pipeline' && req.method === 'POST' && pipelineOptions) {
      return handlePipeline(req, res, pipelineOptions, corsConfig);
    }

    if (path === '/surf/session/start' && req.method === 'POST') {
      return sessionHandlers.start(req, res);
    }

    if (path === '/surf/session/end' && req.method === 'POST') {
      return sessionHandlers.end(req, res);
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: { code: 'NOT_SUPPORTED', message: 'Not found' } }));
  };
}

/**
 * Validates the pipeline request body structure.
 * Returns an error message string if invalid, or null if valid.
 */
function validatePipelineBody(body: unknown): string | null {
  if (body === null || body === undefined || typeof body !== 'object') {
    return 'Pipeline request body must be a JSON object';
  }

  const obj = body as Record<string, unknown>;

  if (!('steps' in obj)) {
    return 'Missing required "steps" array';
  }

  if (!Array.isArray(obj.steps)) {
    return '"steps" must be an array';
  }

  for (let i = 0; i < obj.steps.length; i++) {
    const step = obj.steps[i] as unknown;
    if (step === null || step === undefined || typeof step !== 'object') {
      return `steps[${i}] must be an object`;
    }

    const stepObj = step as Record<string, unknown>;

    if (!('command' in stepObj) || typeof stepObj.command !== 'string') {
      return `steps[${i}] must have a "command" string`;
    }

    if (stepObj.command.trim() === '') {
      return `steps[${i}].command must not be empty`;
    }

    if ('params' in stepObj && stepObj.params !== undefined) {
      if (stepObj.params === null || typeof stepObj.params !== 'object' || Array.isArray(stepObj.params)) {
        return `steps[${i}].params must be an object`;
      }
    }

    if ('as' in stepObj && stepObj.as !== undefined) {
      if (typeof stepObj.as !== 'string') {
        return `steps[${i}].as must be a string`;
      }
    }
  }

  if ('sessionId' in obj && obj.sessionId !== undefined) {
    if (typeof obj.sessionId !== 'string') {
      return '"sessionId" must be a string';
    }
  }

  if ('continueOnError' in obj && obj.continueOnError !== undefined) {
    if (typeof obj.continueOnError !== 'boolean') {
      return '"continueOnError" must be a boolean';
    }
  }

  return null;
}

async function handlePipeline(
  req: Parameters<HttpHandler>[0],
  res: Parameters<HttpHandler>[1],
  options: { registry: CommandRegistry; sessions: InMemorySessionStore; getAuth: (h: Record<string, string | string[] | undefined>) => string | undefined },
  corsConfig?: CorsConfig,
): Promise<void> {
  const requestOrigin = getHeader(req.headers, 'origin');

  if (req.method === 'OPTIONS') {
    res.writeHead(204, resolveCorsPreflightHeaders(corsConfig, requestOrigin, 'POST, OPTIONS'));
    res.end();
    return;
  }

  let body: unknown;
  try {
    body = await parseBody(req as never);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: { code: 'INVALID_PARAMS', message: 'Invalid JSON body' } }));
    return;
  }

  // Validate pipeline request body structure
  const validationError = validatePipelineBody(body);
  if (validationError) {
    res.writeHead(400, { 'Content-Type': 'application/json', ...resolveCorsHeaders(corsConfig, requestOrigin) });
    res.end(JSON.stringify({ ok: false, error: { code: 'INVALID_PARAMS', message: validationError } }));
    return;
  }

  const auth = options.getAuth(req.headers) ?? extractAuth(req.headers);

  try {
    const result = await executePipeline(
      body as Parameters<typeof executePipeline>[0],
      options.registry,
      options.sessions,
      auth,
    );
    res.writeHead(200, { 'Content-Type': 'application/json', ...resolveCorsHeaders(corsConfig, requestOrigin) });
    res.end(JSON.stringify(result));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: { code: 'INTERNAL_ERROR', message: e instanceof Error ? e.message : 'Unknown error' } }));
  }
}

function getErrorStatus(code: string): number {
  switch (code) {
    case 'UNKNOWN_COMMAND': return 404;
    case 'NOT_FOUND': return 404;
    case 'INVALID_PARAMS': return 400;
    case 'AUTH_REQUIRED': return 401;
    case 'AUTH_FAILED': return 403;
    case 'SESSION_EXPIRED': return 410;
    case 'RATE_LIMITED': return 429;
    case 'NOT_SUPPORTED': return 501;
    default: return 500;
  }
}
