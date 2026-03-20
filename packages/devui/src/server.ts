import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { SurfInstance } from '@surfjs/core';
import { generateHtml } from './ui.js';

export interface DevUIOptions {
  /** Port to listen on (default 4242). */
  port?: number;
  /** Host to bind to (default 'localhost'). */
  host?: string;
  /** Override the UI title (defaults to manifest name). */
  title?: string;
  /** Mount path prefix (default '/__surf'). */
  path?: string;
}

export interface DevUI {
  /** Start the standalone HTTP server. */
  start(): Promise<{ url: string }>;
  /** Express-compatible middleware handler. */
  middleware(): (req: IncomingMessage, res: ServerResponse) => void;
  /** Stop the standalone server. */
  stop(): Promise<void>;
}

/**
 * Create a DevUI instance for exploring and testing Surf commands.
 *
 * @example
 * ```ts
 * import { createSurf } from '@surfjs/core';
 * import { createDevUI } from '@surfjs/devui';
 *
 * const surf = createSurf({ name: 'My App', commands: { ... } });
 * const devui = createDevUI(surf, { port: 4242 });
 *
 * const { url } = await devui.start();
 * console.log(`DevUI at ${url}`);
 * ```
 */
export function createDevUI(surf: SurfInstance, options?: DevUIOptions): DevUI {
  const port = options?.port ?? 4242;
  const host = options?.host ?? 'localhost';
  const mountPath = (options?.path ?? '/__surf').replace(/\/$/, '');
  const title = options?.title ?? surf.manifest().name ?? 'Surf DevUI';

  let server: Server | null = null;

  function handleDevUIRequest(req: IncomingMessage, res: ServerResponse): boolean {
    const url = req.url ?? '/';

    if (url === mountPath || url === mountPath + '/') {
      const manifest = surf.manifest();
      const html = generateHtml({
        title,
        manifest,
        manifestPath: `${mountPath}/manifest`,
        executePath: '/surf/execute',
      });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(html);
      return true;
    }

    if (url === `${mountPath}/manifest`) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify(surf.manifest(), null, 2));
      return true;
    }

    return false;
  }

  function routeSurfRequest(req: IncomingMessage, res: ServerResponse): void {
    const surfHandler = surf.middleware();
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf-8');
      const headers: Record<string, string | string[] | undefined> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        headers[k] = v;
      }

      let parsedBody: unknown;
      try { parsedBody = body ? JSON.parse(body) : undefined; } catch { parsedBody = body; }

      void Promise.resolve(surfHandler(
        { method: req.method ?? 'GET', url: req.url ?? '/', headers, body: parsedBody },
        {
          writeHead(status: number, h?: Record<string, string>) { res.writeHead(status, h); },
          end(b?: string) { res.end(b); },
        },
      ));
    });
  }

  return {
    async start(): Promise<{ url: string }> {
      return new Promise((resolve, reject) => {
        server = createServer((req, res) => {
          const url = req.url ?? '/';

          if (url.startsWith(mountPath) && handleDevUIRequest(req, res)) return;

          if (url.startsWith('/surf/') || url === '/.well-known/surf.json') {
            routeSurfRequest(req, res);
            return;
          }

          if (url === '/') {
            res.writeHead(302, { Location: mountPath });
            res.end();
            return;
          }

          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
        });

        server.on('error', reject);
        server.listen(port, host, () => resolve({ url: `http://${host}:${port}${mountPath}` }));
      });
    },

    middleware(): (req: IncomingMessage, res: ServerResponse) => void {
      return (req: IncomingMessage, res: ServerResponse) => {
        if ((req.url ?? '/').startsWith(mountPath)) {
          handleDevUIRequest(req, res);
        }
      };
    },

    async stop(): Promise<void> {
      return new Promise((resolve, reject) => {
        if (!server) { resolve(); return; }
        server.close((err) => { server = null; if (err) reject(err); else resolve(); });
      });
    },
  };
}
