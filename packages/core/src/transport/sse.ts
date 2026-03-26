import type { StreamChunk } from '../types.js';

/**
 * SSE response writer — works with raw Node.js http.ServerResponse and Express.
 */
export interface SseWriter {
  /** Write a single SSE event. */
  write(chunk: StreamChunk): void;
  /** Close the SSE stream. */
  close(): void;
}

export interface SseCompatibleResponse {
  writeHead(status: number, headers?: Record<string, string>): void;
  write(data: string): boolean;
  end(body?: string): void;
  /** Express-specific: flush headers immediately. */
  flushHeaders?: () => void;
}

/**
 * Initialize an SSE stream on the given response object.
 * Compatible with raw Node.js http, Express, and Fastify.
 */
export function createSseWriter(res: SseCompatibleResponse): SseWriter {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  return {
    write(chunk: StreamChunk) {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    },
    close() {
      res.end();
    },
  };
}

export function chunkEvent(data: unknown): StreamChunk {
  return { type: 'chunk', data };
}

export function doneEvent(result?: unknown): StreamChunk {
  return { type: 'done', result };
}

export function errorEvent(code: string, message: string): StreamChunk {
  return { type: 'error', error: { code, message } };
}
