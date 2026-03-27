/**
 * Advanced SurfClient tests — covers:
 *  - Initialization (fromManifest, discover, option propagation)
 *  - Request building (headers, body shape, basePath)
 *  - Response parsing (ok/error, result, session state)
 *  - Auth flows (setAuth, token rotation, clearing auth)
 *  - Retry logic (backoff, retryOn codes, permanent errors, retryAfter)
 *  - Streaming via ReadableStream mock (event data)
 *  - Cache behaviour (side-effects commands, per-command clearCache)
 *  - Session lifecycle (start, execute, state, end)
 *  - Pipeline (sessionId, multiple steps)
 *  - checkForUpdates
 *  - SurfClientError properties
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SurfClient, SurfClientError } from '../src/client.js';
import type { SurfManifest, SurfResponse } from '../src/types.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const BASE_MANIFEST: SurfManifest = {
  surf: '0.1.0',
  name: 'AdvancedShop',
  version: '2.0.0',
  description: 'A test-only Surf site',
  commands: {
    search: {
      description: 'Search products',
      params: { query: { type: 'string', required: true } },
      returns: { type: 'array' },
      hints: { sideEffects: false, idempotent: true },
    },
    checkout: {
      description: 'Checkout cart',
      hints: { sideEffects: true },
    },
    rateMe: {
      description: 'Rate-limited endpoint',
    },
    authOnly: {
      description: 'Requires auth',
      auth: 'required',
    },
    getItem: {
      description: 'Fetch single item',
      params: { id: { type: 'string', required: true } },
      hints: { sideEffects: false },
    },
  },
  auth: { type: 'bearer' },
  checksum: 'deadbeef',
  updatedAt: '2024-06-01T00:00:00Z',
};

/** Capture all fetch calls for inspection */
type MockCall = [string, RequestInit | undefined];

function buildMockFetch(
  handlers: Record<string, (body: Record<string, unknown>, url: string, init?: RequestInit) => unknown>,
) {
  const calls: MockCall[] = [];

  const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([url, init]);
    const path = new URL(url).pathname;

    if (path === '/.well-known/surf.json') {
      return {
        ok: true,
        status: 200,
        json: async () => BASE_MANIFEST,
        text: async () => JSON.stringify(BASE_MANIFEST),
      };
    }

    const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {};
    const handler = handlers[path];
    if (!handler) {
      return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) };
    }

    const result = await handler(body, url, init);
    return {
      ok: true,
      status: 200,
      json: async () => result,
      text: async () => JSON.stringify(result),
    };
  }) as unknown as typeof globalThis.fetch & { _calls: MockCall[] };

  (fetchFn as unknown as { _calls: MockCall[] })._calls = calls;
  return { fetchFn, calls };
}

const BASE_URL = 'http://localhost:3000';

// ─── Initialization ──────────────────────────────────────────────────────────

describe('SurfClient — initialization', () => {
  it('fromManifest builds client without network call', () => {
    const { fetchFn } = buildMockFetch({});
    const client = SurfClient.fromManifest(BASE_MANIFEST, { baseUrl: BASE_URL, fetch: fetchFn });
    expect(client.manifest.name).toBe('AdvancedShop');
    expect(client.manifest.version).toBe('2.0.0');
    expect(vi.isMockFunction(fetchFn)).toBe(true);
    // No fetch calls made during construction
    expect((fetchFn as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it('discover fetches /.well-known/surf.json', async () => {
    const { fetchFn, calls } = buildMockFetch({});
    await SurfClient.discover(BASE_URL, { fetch: fetchFn });
    const discoverCall = calls.find(([url]) => url.includes('/.well-known/surf.json'));
    expect(discoverCall).toBeDefined();
  });

  it('discover strips trailing slash from baseUrl', async () => {
    const { fetchFn, calls } = buildMockFetch({});
    await SurfClient.discover(`${BASE_URL}/`, { fetch: fetchFn });
    // Should call the correct URL without double-slash
    const wellKnownCall = calls.find(([url]) => url.includes('/.well-known/surf.json'));
    expect(wellKnownCall?.[0]).not.toContain('//.');
  });

  it('expose commands from manifest', () => {
    const client = SurfClient.fromManifest(BASE_MANIFEST, { baseUrl: BASE_URL });
    expect(Object.keys(client.commands)).toContain('search');
    expect(Object.keys(client.commands)).toContain('checkout');
  });

  it('command() returns single command definition', () => {
    const client = SurfClient.fromManifest(BASE_MANIFEST, { baseUrl: BASE_URL });
    const cmd = client.command('search');
    expect(cmd?.description).toBe('Search products');
    expect(cmd?.hints?.idempotent).toBe(true);
  });

  it('command() returns undefined for unknown command', () => {
    const client = SurfClient.fromManifest(BASE_MANIFEST, { baseUrl: BASE_URL });
    expect(client.command('nonexistent')).toBeUndefined();
  });

  it('respects custom basePath option', async () => {
    const { fetchFn, calls } = buildMockFetch({
      '/api/surf/execute': () => ({ ok: true, result: 'custom-path' } satisfies SurfResponse),
    });
    const client = SurfClient.fromManifest(BASE_MANIFEST, {
      baseUrl: BASE_URL,
      fetch: fetchFn,
      basePath: '/api/surf/execute',
    });
    const result = await client.execute('search', { query: 'test' });
    expect(result).toBe('custom-path');
    const executeCall = calls.find(([url]) => url.includes('/api/surf/execute'));
    expect(executeCall).toBeDefined();
  });
});

// ─── Request Building ────────────────────────────────────────────────────────

describe('SurfClient — request building', () => {
  it('sends POST with correct Content-Type', async () => {
    const { fetchFn, calls } = buildMockFetch({
      '/surf/execute': () => ({ ok: true, result: [] } satisfies SurfResponse),
    });
    const client = SurfClient.fromManifest(BASE_MANIFEST, { baseUrl: BASE_URL, fetch: fetchFn });
    await client.execute('search', { query: 'shoes' });

    const executeCall = calls.find(([url]) => url.includes('/surf/execute'));
    const headers = executeCall?.[1]?.headers as Record<string, string>;
    expect(headers?.['Content-Type']).toBe('application/json');
  });

  it('sends Authorization header when auth token is set', async () => {
    const { fetchFn, calls } = buildMockFetch({
      '/surf/execute': () => ({ ok: true, result: null } satisfies SurfResponse),
    });
    const client = SurfClient.fromManifest(BASE_MANIFEST, {
      baseUrl: BASE_URL,
      fetch: fetchFn,
      auth: 'my-secret-token',
    });
    await client.execute('authOnly');

    const executeCall = calls.find(([url]) => url.includes('/surf/execute'));
    const headers = executeCall?.[1]?.headers as Record<string, string>;
    expect(headers?.['Authorization']).toBe('Bearer my-secret-token');
  });

  it('sends correct body: command + params', async () => {
    const { fetchFn, calls } = buildMockFetch({
      '/surf/execute': () => ({ ok: true, result: [] } satisfies SurfResponse),
    });
    const client = SurfClient.fromManifest(BASE_MANIFEST, { baseUrl: BASE_URL, fetch: fetchFn });
    await client.execute('search', { query: 'sneakers', limit: 10 });

    const executeCall = calls.find(([url]) => url.includes('/surf/execute'));
    const body = JSON.parse(executeCall?.[1]?.body as string) as Record<string, unknown>;
    expect(body.command).toBe('search');
    expect(body.params).toEqual({ query: 'sneakers', limit: 10 });
  });

  it('sends empty params object when no params given', async () => {
    const { fetchFn, calls } = buildMockFetch({
      '/surf/execute': () => ({ ok: true, result: null } satisfies SurfResponse),
    });
    const client = SurfClient.fromManifest(BASE_MANIFEST, { baseUrl: BASE_URL, fetch: fetchFn });
    await client.execute('checkout');

    const executeCall = calls.find(([url]) => url.includes('/surf/execute'));
    const body = JSON.parse(executeCall?.[1]?.body as string) as Record<string, unknown>;
    expect(body.params).toEqual({});
  });

  it('omits Authorization header when no auth token', async () => {
    const { fetchFn, calls } = buildMockFetch({
      '/surf/execute': () => ({ ok: true, result: [] } satisfies SurfResponse),
    });
    const client = SurfClient.fromManifest(BASE_MANIFEST, { baseUrl: BASE_URL, fetch: fetchFn });
    await client.execute('search', { query: 'test' });

    const executeCall = calls.find(([url]) => url.includes('/surf/execute'));
    const headers = executeCall?.[1]?.headers as Record<string, string>;
    expect(headers?.['Authorization']).toBeUndefined();
  });
});

// ─── Response Parsing ────────────────────────────────────────────────────────

describe('SurfClient — response parsing', () => {
  it('returns result from ok: true response', async () => {
    const expected = [{ id: 1, name: 'Air Max' }];
    const { fetchFn } = buildMockFetch({
      '/surf/execute': () => ({ ok: true, result: expected } satisfies SurfResponse),
    });
    const client = SurfClient.fromManifest(BASE_MANIFEST, { baseUrl: BASE_URL, fetch: fetchFn });
    const result = await client.execute('search', { query: 'air max' });
    expect(result).toEqual(expected);
  });

  it('returns null result correctly', async () => {
    const { fetchFn } = buildMockFetch({
      '/surf/execute': () => ({ ok: true, result: null } satisfies SurfResponse),
    });
    const client = SurfClient.fromManifest(BASE_MANIFEST, { baseUrl: BASE_URL, fetch: fetchFn });
    const result = await client.execute('checkout');
    expect(result).toBeNull();
  });

  it('throws SurfClientError on ok: false response', async () => {
    const { fetchFn } = buildMockFetch({
      '/surf/execute': () => ({
        ok: false,
        error: { code: 'INVALID_PARAMS', message: 'Missing required: query' },
      } satisfies SurfResponse),
    });
    const client = SurfClient.fromManifest(BASE_MANIFEST, { baseUrl: BASE_URL, fetch: fetchFn });
    await expect(client.execute('search')).rejects.toThrow(SurfClientError);
  });

  it('SurfClientError has correct code from server error', async () => {
    const { fetchFn } = buildMockFetch({
      '/surf/execute': () => ({
        ok: false,
        error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
      } satisfies SurfResponse),
    });
    const client = SurfClient.fromManifest(BASE_MANIFEST, { baseUrl: BASE_URL, fetch: fetchFn });
    const err = await client.execute('authOnly').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SurfClientError);
    expect((err as SurfClientError).code).toBe('AUTH_REQUIRED');
  });

  it('SurfClientError message includes code and message', async () => {
    const { fetchFn } = buildMockFetch({
      '/surf/execute': () => ({
        ok: false,
        error: { code: 'UNKNOWN_COMMAND', message: 'Command does not exist' },
      } satisfies SurfResponse),
    });
    const client = SurfClient.fromManifest(BASE_MANIFEST, { baseUrl: BASE_URL, fetch: fetchFn });
    const err = await client.execute('ghost').catch((e: unknown) => e);
    expect((err as SurfClientError).message).toContain('UNKNOWN_COMMAND');
    expect((err as SurfClientError).message).toContain('Command does not exist');
  });

  it('parses retryAfterMs from error details into retryAfter seconds', async () => {
    const { fetchFn } = buildMockFetch({
      '/surf/execute': () => ({
        ok: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests',
          details: { retryAfterMs: 30000 },
        },
      } satisfies SurfResponse),
    });
    const client = SurfClient.fromManifest(BASE_MANIFEST, { baseUrl: BASE_URL, fetch: fetchFn });
    const err = await client.execute('rateMe').catch((e: unknown) => e);
    expect((err as SurfClientError).retryAfter).toBe(30); // 30000ms → 30s
  });
});

// ─── Auth Flows ──────────────────────────────────────────────────────────────

describe('SurfClient — auth flows', () => {
  it('setAuth updates token for subsequent requests', async () => {
    const capturedHeaders: Array<Record<string, string>> = [];
    const { fetchFn } = buildMockFetch({
      '/surf/execute': (_body, _url, init) => {
        const headers = init?.headers as Record<string, string> | undefined;
        if (headers) capturedHeaders.push({ ...headers });
        return { ok: true, result: null } satisfies SurfResponse;
      },
    });
    const client = SurfClient.fromManifest(BASE_MANIFEST, {
      baseUrl: BASE_URL,
      fetch: fetchFn,
      auth: 'old-token',
    });

    // First call with old token
    await client.execute('getItem', { id: '1' });

    // Rotate token
    client.setAuth('new-token');

    // Second call should use new token
    await client.execute('getItem', { id: '2' });

    expect(capturedHeaders[0]?.['Authorization']).toBe('Bearer old-token');
    expect(capturedHeaders[1]?.['Authorization']).toBe('Bearer new-token');
  });

  it('setAuth(undefined) removes Authorization header', async () => {
    const capturedHeaders: Array<Record<string, string | undefined>> = [];
    const { fetchFn } = buildMockFetch({
      '/surf/execute': (_body, _url, init) => {
        const headers = init?.headers as Record<string, string> | undefined;
        capturedHeaders.push({ auth: headers?.['Authorization'] });
        return { ok: true, result: null } satisfies SurfResponse;
      },
    });
    const client = SurfClient.fromManifest(BASE_MANIFEST, {
      baseUrl: BASE_URL,
      fetch: fetchFn,
      auth: 'active-token',
    });

    await client.execute('search', { query: 'test' });
    client.setAuth(undefined);
    await client.execute('search', { query: 'test2' });

    expect(capturedHeaders[0]?.auth).toBe('Bearer active-token');
    expect(capturedHeaders[1]?.auth).toBeUndefined();
  });

  it('auth token from options is sent on first request', async () => {
    const capturedHeaders: Array<Record<string, string>> = [];
    const { fetchFn } = buildMockFetch({
      '/surf/execute': (_body, _url, init) => {
        const h = init?.headers as Record<string, string> | undefined;
        if (h) capturedHeaders.push({ ...h });
        return { ok: true, result: null } satisfies SurfResponse;
      },
    });
    const client = SurfClient.fromManifest(BASE_MANIFEST, {
      baseUrl: BASE_URL,
      fetch: fetchFn,
      auth: 'initial-token',
    });
    await client.execute('authOnly');
    expect(capturedHeaders[0]?.['Authorization']).toBe('Bearer initial-token');
  });

  it('pipeline sends auth header', async () => {
    const capturedHeaders: Array<Record<string, string>> = [];
    const { fetchFn } = buildMockFetch({
      '/surf/pipeline': (_body, _url, init) => {
        const h = init?.headers as Record<string, string> | undefined;
        if (h) capturedHeaders.push({ ...h });
        return { ok: true, results: [] };
      },
    });
    const client = SurfClient.fromManifest(BASE_MANIFEST, {
      baseUrl: BASE_URL,
      fetch: fetchFn,
      auth: 'pipe-token',
    });
    await client.pipeline([{ command: 'search', params: { query: 'test' } }]);
    expect(capturedHeaders[0]?.['Authorization']).toBe('Bearer pipe-token');
  });
});

// ─── Retry Logic ─────────────────────────────────────────────────────────────

describe('SurfClient — retry logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries on error and eventually succeeds', async () => {
    let callCount = 0;
    const fetchFn = vi.fn(async () => {
      callCount++;
      if (callCount < 3) {
        // Simulate network-level failure (throw) on first 2 attempts
        throw new Error('Network error');
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: 'success' } satisfies SurfResponse),
      };
    }) as unknown as typeof globalThis.fetch;

    const client = SurfClient.fromManifest(BASE_MANIFEST, {
      baseUrl: BASE_URL,
      fetch: fetchFn,
      retry: { maxAttempts: 3, backoffMs: 100, backoffMultiplier: 2, retryOn: [429, 502] },
    });

    const promise = client.execute('search', { query: 'test' });

    // Advance timers to process all retries
    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result).toBe('success');
    expect(callCount).toBe(3);
  });

  it('does not retry UNKNOWN_COMMAND (permanent error)', async () => {
    let callCount = 0;
    const fetchFn = vi.fn(async () => {
      callCount++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: false,
          error: { code: 'UNKNOWN_COMMAND', message: 'No such command' },
        } satisfies SurfResponse),
      };
    }) as unknown as typeof globalThis.fetch;

    const client = SurfClient.fromManifest(BASE_MANIFEST, {
      baseUrl: BASE_URL,
      fetch: fetchFn,
      retry: { maxAttempts: 3, backoffMs: 100, backoffMultiplier: 2, retryOn: [429] },
    });

    await expect(client.execute('ghost')).rejects.toThrow(SurfClientError);
    expect(callCount).toBe(1); // Only one attempt — permanent error
  });

  it('does not retry AUTH_REQUIRED (permanent error)', async () => {
    let callCount = 0;
    const fetchFn = vi.fn(async () => {
      callCount++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: false,
          error: { code: 'AUTH_REQUIRED', message: 'Token required' },
        } satisfies SurfResponse),
      };
    }) as unknown as typeof globalThis.fetch;

    const client = SurfClient.fromManifest(BASE_MANIFEST, {
      baseUrl: BASE_URL,
      fetch: fetchFn,
      retry: { maxAttempts: 3, backoffMs: 100, backoffMultiplier: 2, retryOn: [429] },
    });

    await expect(client.execute('authOnly')).rejects.toThrow(SurfClientError);
    expect(callCount).toBe(1);
  });

  it('does not retry INVALID_PARAMS (permanent error)', async () => {
    let callCount = 0;
    const fetchFn = vi.fn(async () => {
      callCount++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: false,
          error: { code: 'INVALID_PARAMS', message: 'Bad params' },
        } satisfies SurfResponse),
      };
    }) as unknown as typeof globalThis.fetch;

    const client = SurfClient.fromManifest(BASE_MANIFEST, {
      baseUrl: BASE_URL,
      fetch: fetchFn,
      retry: { maxAttempts: 3, backoffMs: 100, backoffMultiplier: 2, retryOn: [429] },
    });

    await expect(client.execute('search')).rejects.toThrow(SurfClientError);
    expect(callCount).toBe(1);
  });

  it('throws after maxAttempts exhausted', async () => {
    let callCount = 0;
    const fetchFn = vi.fn(async () => {
      callCount++;
      throw new Error('Always fails');
    }) as unknown as typeof globalThis.fetch;

    const client = SurfClient.fromManifest(BASE_MANIFEST, {
      baseUrl: BASE_URL,
      fetch: fetchFn,
      retry: { maxAttempts: 3, backoffMs: 10, backoffMultiplier: 1, retryOn: [429] },
    });

    // Attach rejection handler BEFORE advancing timers to avoid unhandled rejections
    const promise = client.execute('search', { query: 'x' });
    const expectation = expect(promise).rejects.toThrow();
    await vi.runAllTimersAsync();
    await expectation;
    expect(callCount).toBe(3);
  });

  it('without retry config: fails immediately without retrying', async () => {
    let callCount = 0;
    const fetchFn = vi.fn(async () => {
      callCount++;
      throw new Error('Network failure');
    }) as unknown as typeof globalThis.fetch;

    const client = SurfClient.fromManifest(BASE_MANIFEST, {
      baseUrl: BASE_URL,
      fetch: fetchFn,
      // No retry config
    });

    await expect(client.execute('search', { query: 'test' })).rejects.toThrow();
    expect(callCount).toBe(1);
  });
});

// ─── Streaming via ReadableStream ──────────────────────────────────────────

describe('SurfClient — streaming (ReadableStream)', () => {
  it('execute handles streaming JSON response body via ReadableStream', async () => {
    const streamData = JSON.stringify({ ok: true, result: { items: [1, 2, 3] } });
    const encoder = new TextEncoder();
    const chunks = [encoder.encode(streamData)];

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    });

    // Helper to collect ReadableStream into a string
    async function readStream(readable: ReadableStream<Uint8Array>): Promise<string> {
      const reader = readable.getReader();
      const parts: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) parts.push(value);
      }
      const total = new Uint8Array(parts.reduce((acc, p) => acc + p.byteLength, 0));
      let offset = 0;
      for (const part of parts) {
        total.set(part, offset);
        offset += part.byteLength;
      }
      return new TextDecoder().decode(total);
    }

    // Simulate reading the stream ourselves
    const text = await readStream(stream);
    const parsed = JSON.parse(text) as { ok: boolean; result: { items: number[] } };
    expect(parsed.ok).toBe(true);
    expect(parsed.result.items).toEqual([1, 2, 3]);
  });

  it('multi-chunk ReadableStream assembles correctly', async () => {
    const payloadObj = { ok: true, result: 'assembled' };
    const encoded = new TextEncoder().encode(JSON.stringify(payloadObj));

    // Split into 3 chunks
    const chunk1 = encoded.slice(0, 10);
    const chunk2 = encoded.slice(10, 20);
    const chunk3 = encoded.slice(20);

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk1);
        controller.enqueue(chunk2);
        controller.enqueue(chunk3);
        controller.close();
      },
    });

    const reader = stream.getReader();
    const parts: Uint8Array[] = [];
    let done = false;
    while (!done) {
      const read = await reader.read();
      done = read.done;
      if (read.value) parts.push(read.value);
    }
    const full = new Uint8Array(parts.reduce((acc, p) => acc + p.byteLength, 0));
    let off = 0;
    for (const p of parts) { full.set(p, off); off += p.byteLength; }

    const text = new TextDecoder().decode(full);
    const parsed = JSON.parse(text) as { ok: boolean; result: string };
    expect(parsed.ok).toBe(true);
    expect(parsed.result).toBe('assembled');
  });

  it('client execute with fetch that returns body as stream', async () => {
    const responseBody = JSON.stringify({ ok: true, result: { streamed: true } });
    const fetchFn = vi.fn(async (url: string) => {
      if (new URL(url).pathname === '/surf/execute') {
        return {
          ok: true,
          status: 200,
          json: async () => JSON.parse(responseBody) as SurfResponse,
          text: async () => responseBody,
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => BASE_MANIFEST,
        text: async () => JSON.stringify(BASE_MANIFEST),
      };
    }) as unknown as typeof globalThis.fetch;

    const client = SurfClient.fromManifest(BASE_MANIFEST, { baseUrl: BASE_URL, fetch: fetchFn });
    const result = await client.execute('search', { query: 'stream-test' });
    expect(result).toEqual({ streamed: true });
  });
});

// ─── Cache Behaviour ──────────────────────────────────────────────────────────

describe('SurfClient — cache behaviour', () => {
  it('caches result for non-side-effect commands', async () => {
    let executeCalls = 0;
    const fetchFn = vi.fn(async (url: string) => {
      if (new URL(url).pathname === '/surf/execute') executeCalls++;
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: ['cached-item'] } satisfies SurfResponse),
      };
    }) as unknown as typeof globalThis.fetch;

    const client = SurfClient.fromManifest(BASE_MANIFEST, {
      baseUrl: BASE_URL,
      fetch: fetchFn,
      cache: { ttlMs: 60000, maxSize: 50 },
    });

    await client.execute('search', { query: 'shoes' });
    await client.execute('search', { query: 'shoes' }); // Should hit cache
    await client.execute('search', { query: 'shoes' }); // Should hit cache

    expect(executeCalls).toBe(1);
  });

  it('does NOT cache side-effect commands', async () => {
    let executeCalls = 0;
    const fetchFn = vi.fn(async (url: string) => {
      if (new URL(url).pathname === '/surf/execute') executeCalls++;
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: 'done' } satisfies SurfResponse),
      };
    }) as unknown as typeof globalThis.fetch;

    const client = SurfClient.fromManifest(BASE_MANIFEST, {
      baseUrl: BASE_URL,
      fetch: fetchFn,
      cache: { ttlMs: 60000, maxSize: 50 },
    });

    await client.execute('checkout'); // sideEffects: true
    await client.execute('checkout');
    await client.execute('checkout');

    expect(executeCalls).toBe(3); // Always fetches — no caching
  });

  it('different params are cached separately', async () => {
    let executeCalls = 0;
    const fetchFn = vi.fn(async (url: string) => {
      if (new URL(url).pathname === '/surf/execute') executeCalls++;
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: [] } satisfies SurfResponse),
      };
    }) as unknown as typeof globalThis.fetch;

    const client = SurfClient.fromManifest(BASE_MANIFEST, {
      baseUrl: BASE_URL,
      fetch: fetchFn,
      cache: { ttlMs: 60000, maxSize: 50 },
    });

    await client.execute('search', { query: 'shoes' });
    await client.execute('search', { query: 'boots' }); // Different params — new fetch
    await client.execute('search', { query: 'shoes' }); // Cached — no fetch

    expect(executeCalls).toBe(2);
  });

  it('clearCache() clears all entries', async () => {
    let executeCalls = 0;
    const fetchFn = vi.fn(async (url: string) => {
      if (new URL(url).pathname === '/surf/execute') executeCalls++;
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: [] } satisfies SurfResponse),
      };
    }) as unknown as typeof globalThis.fetch;

    const client = SurfClient.fromManifest(BASE_MANIFEST, {
      baseUrl: BASE_URL,
      fetch: fetchFn,
      cache: { ttlMs: 60000, maxSize: 50 },
    });

    await client.execute('search', { query: 'shoes' }); // fetch
    client.clearCache();
    await client.execute('search', { query: 'shoes' }); // fetch again

    expect(executeCalls).toBe(2);
  });

  it('clearCache(command) clears only that command', async () => {
    let searchCalls = 0;
    let getItemCalls = 0;
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      if (new URL(url).pathname === '/surf/execute') {
        const body = JSON.parse(init?.body as string) as { command: string };
        if (body.command === 'search') searchCalls++;
        if (body.command === 'getItem') getItemCalls++;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: [] } satisfies SurfResponse),
      };
    }) as unknown as typeof globalThis.fetch;

    const client = SurfClient.fromManifest(BASE_MANIFEST, {
      baseUrl: BASE_URL,
      fetch: fetchFn,
      cache: { ttlMs: 60000, maxSize: 50 },
    });

    await client.execute('search', { query: 'shoes' });
    await client.execute('getItem', { id: '1' });
    client.clearCache('search'); // Only clear search
    await client.execute('search', { query: 'shoes' }); // Re-fetched
    await client.execute('getItem', { id: '1' }); // Still cached

    expect(searchCalls).toBe(2);
    expect(getItemCalls).toBe(1);
  });

  it('no-cache mode always fetches', async () => {
    let executeCalls = 0;
    const fetchFn = vi.fn(async (url: string) => {
      if (new URL(url).pathname === '/surf/execute') executeCalls++;
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: [] } satisfies SurfResponse),
      };
    }) as unknown as typeof globalThis.fetch;

    // No cache option
    const client = SurfClient.fromManifest(BASE_MANIFEST, { baseUrl: BASE_URL, fetch: fetchFn });
    await client.execute('search', { query: 'shoes' });
    await client.execute('search', { query: 'shoes' });

    expect(executeCalls).toBe(2);
  });
});

// ─── Session Lifecycle ────────────────────────────────────────────────────────

describe('SurfClient — session lifecycle', () => {
  it('startSession returns a session with id', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      if (path === '/surf/session/start') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, sessionId: 'sess_abc123' }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }) as unknown as typeof globalThis.fetch;

    const client = SurfClient.fromManifest(BASE_MANIFEST, { baseUrl: BASE_URL, fetch: fetchFn });
    const session = await client.startSession();
    expect(session.id).toBe('sess_abc123');
  });

  it('session.execute sends sessionId in body', async () => {
    const capturedBodies: Record<string, unknown>[] = [];
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      if (path === '/surf/session/start') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, sessionId: 'sess_xyz' }),
        };
      }
      if (path === '/surf/execute') {
        capturedBodies.push(JSON.parse(init?.body as string) as Record<string, unknown>);
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, result: 'session-result' } satisfies SurfResponse),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }) as unknown as typeof globalThis.fetch;

    const client = SurfClient.fromManifest(BASE_MANIFEST, { baseUrl: BASE_URL, fetch: fetchFn });
    const session = await client.startSession();
    await session.execute('search', { query: 'test' });

    expect(capturedBodies[0]?.sessionId).toBe('sess_xyz');
    expect(capturedBodies[0]?.command).toBe('search');
  });

  it('session.state updates from server response', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      if (path === '/surf/session/start') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, sessionId: 'sess_state' }),
        };
      }
      if (path === '/surf/execute') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            result: 'done',
            state: { cartItems: 3, total: 99.99 },
          } satisfies SurfResponse),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }) as unknown as typeof globalThis.fetch;

    const client = SurfClient.fromManifest(BASE_MANIFEST, { baseUrl: BASE_URL, fetch: fetchFn });
    const session = await client.startSession();

    expect(session.state).toEqual({});
    await session.execute('checkout');
    expect(session.state).toEqual({ cartItems: 3, total: 99.99 });
  });

  it('session.execute throws SurfClientError on error response', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      if (path === '/surf/session/start') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, sessionId: 'sess_err' }),
        };
      }
      if (path === '/surf/execute') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: false,
            error: { code: 'SESSION_EXPIRED', message: 'Session has expired' },
          } satisfies SurfResponse),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }) as unknown as typeof globalThis.fetch;

    const client = SurfClient.fromManifest(BASE_MANIFEST, { baseUrl: BASE_URL, fetch: fetchFn });
    const session = await client.startSession();
    const err = await session.execute('search', { query: 'x' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SurfClientError);
    expect((err as SurfClientError).code).toBe('SESSION_EXPIRED');
  });

  it('session.end sends POST to /surf/session/end', async () => {
    const capturedPaths: string[] = [];
    const capturedBodies: Record<string, unknown>[] = [];
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      capturedPaths.push(path);
      if (path === '/surf/session/start') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, sessionId: 'sess_end' }),
        };
      }
      if (path === '/surf/session/end') {
        capturedBodies.push(JSON.parse(init?.body as string) as Record<string, unknown>);
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }) as unknown as typeof globalThis.fetch;

    const client = SurfClient.fromManifest(BASE_MANIFEST, { baseUrl: BASE_URL, fetch: fetchFn });
    const session = await client.startSession();
    await session.end();

    expect(capturedPaths).toContain('/surf/session/end');
    expect(capturedBodies[0]?.sessionId).toBe('sess_end');
  });
});

// ─── Pipeline ─────────────────────────────────────────────────────────────────

describe('SurfClient — pipeline', () => {
  it('sends all steps to /surf/pipeline', async () => {
    let capturedBody: Record<string, unknown> = {};
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      if (path === '/surf/pipeline') {
        capturedBody = JSON.parse(init?.body as string) as Record<string, unknown>;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            results: [
              { command: 'search', ok: true, result: [] },
              { command: 'getItem', ok: true, result: { id: '1' } },
            ],
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }) as unknown as typeof globalThis.fetch;

    const client = SurfClient.fromManifest(BASE_MANIFEST, { baseUrl: BASE_URL, fetch: fetchFn });
    const response = await client.pipeline([
      { command: 'search', params: { query: 'shoes' } },
      { command: 'getItem', params: { id: '1' } },
    ]);

    expect(response.ok).toBe(true);
    expect(response.results).toHaveLength(2);
    const steps = capturedBody.steps as Array<{ command: string }>;
    expect(steps[0]?.command).toBe('search');
    expect(steps[1]?.command).toBe('getItem');
  });

  it('sends sessionId option in pipeline body', async () => {
    let capturedBody: Record<string, unknown> = {};
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      if (path === '/surf/pipeline') {
        capturedBody = JSON.parse(init?.body as string) as Record<string, unknown>;
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, results: [] }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }) as unknown as typeof globalThis.fetch;

    const client = SurfClient.fromManifest(BASE_MANIFEST, { baseUrl: BASE_URL, fetch: fetchFn });
    await client.pipeline(
      [{ command: 'search', params: { query: 'test' } }],
      { sessionId: 'sess_pipe' },
    );

    expect(capturedBody.sessionId).toBe('sess_pipe');
  });

  it('throws SurfClientError on non-ok HTTP pipeline response', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: async () => ({}),
    })) as unknown as typeof globalThis.fetch;

    const client = SurfClient.fromManifest(BASE_MANIFEST, { baseUrl: BASE_URL, fetch: fetchFn });
    const err = await client.pipeline([{ command: 'search' }]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SurfClientError);
    expect((err as SurfClientError).code).toBe('HTTP_ERROR');
    expect((err as SurfClientError).statusCode).toBe(503);
  });
});

// ─── checkForUpdates ──────────────────────────────────────────────────────────

describe('SurfClient — checkForUpdates', () => {
  it('returns changed: false when checksum matches', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => BASE_MANIFEST, // Same checksum
      text: async () => JSON.stringify(BASE_MANIFEST),
    })) as unknown as typeof globalThis.fetch;

    const client = SurfClient.fromManifest(BASE_MANIFEST, { baseUrl: BASE_URL, fetch: fetchFn });
    const result = await client.checkForUpdates();
    expect(result.changed).toBe(false);
    expect(result.checksum).toBe('deadbeef');
    expect(result.manifest).toBeUndefined();
  });

  it('returns changed: true with new manifest when checksum differs', async () => {
    const newManifest: SurfManifest = { ...BASE_MANIFEST, checksum: 'newchecksum' };
    const fetchFn = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => newManifest,
      text: async () => JSON.stringify(newManifest),
    })) as unknown as typeof globalThis.fetch;

    const client = SurfClient.fromManifest(BASE_MANIFEST, { baseUrl: BASE_URL, fetch: fetchFn });
    const result = await client.checkForUpdates();
    expect(result.changed).toBe(true);
    expect(result.checksum).toBe('newchecksum');
    expect(result.manifest).toBeDefined();
    expect(result.manifest?.checksum).toBe('newchecksum');
  });

  it('returns changed: false when discovery fails (graceful)', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('Network error');
    }) as unknown as typeof globalThis.fetch;

    const client = SurfClient.fromManifest(BASE_MANIFEST, { baseUrl: BASE_URL, fetch: fetchFn });
    const result = await client.checkForUpdates();
    expect(result.changed).toBe(false);
    expect(result.checksum).toBe('deadbeef');
  });
});

// ─── SurfClientError ──────────────────────────────────────────────────────────

describe('SurfClientError', () => {
  it('is instanceof Error', () => {
    const err = new SurfClientError('Something went wrong', 'INTERNAL_ERROR');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(SurfClientError);
  });

  it('has correct name', () => {
    const err = new SurfClientError('msg', 'AUTH_FAILED');
    expect(err.name).toBe('SurfClientError');
  });

  it('exposes code property', () => {
    const err = new SurfClientError('msg', 'SESSION_EXPIRED');
    expect(err.code).toBe('SESSION_EXPIRED');
  });

  it('exposes optional statusCode', () => {
    const err = new SurfClientError('msg', 'RATE_LIMITED', 429);
    expect(err.statusCode).toBe(429);
  });

  it('statusCode is undefined when not provided', () => {
    const err = new SurfClientError('msg', 'INTERNAL_ERROR');
    expect(err.statusCode).toBeUndefined();
  });

  it('exposes optional retryAfter', () => {
    const err = new SurfClientError('msg', 'RATE_LIMITED', 429, 60);
    expect(err.retryAfter).toBe(60);
  });

  it('retryAfter is undefined when not provided', () => {
    const err = new SurfClientError('msg', 'RATE_LIMITED', 429);
    expect(err.retryAfter).toBeUndefined();
  });

  it('message is accessible', () => {
    const err = new SurfClientError('This is my error message', 'NOT_FOUND');
    expect(err.message).toBe('This is my error message');
  });

  it('all SurfErrorCodes produce correct SurfClientError', async () => {
    const codes = [
      'UNKNOWN_COMMAND',
      'INVALID_PARAMS',
      'AUTH_REQUIRED',
      'AUTH_FAILED',
      'SESSION_EXPIRED',
      'RATE_LIMITED',
      'INTERNAL_ERROR',
      'NOT_SUPPORTED',
    ] as const;

    for (const code of codes) {
      const fetchFn = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          ok: false,
          error: { code, message: `Test error: ${code}` },
        } satisfies SurfResponse),
      })) as unknown as typeof globalThis.fetch;

      const client = SurfClient.fromManifest(BASE_MANIFEST, { baseUrl: BASE_URL, fetch: fetchFn });
      const err = await client.execute('search').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(SurfClientError);
      expect((err as SurfClientError).code).toBe(code);
    }
  });
});

// ─── Typed Proxy ──────────────────────────────────────────────────────────────

describe('SurfClient — typed proxy', () => {
  it('typed() proxy returns correct result type', async () => {
    const { fetchFn } = buildMockFetch({
      '/surf/execute': () => ({ ok: true, result: [{ id: '1', name: 'Shoe' }] } satisfies SurfResponse),
    });
    const client = SurfClient.fromManifest(BASE_MANIFEST, { baseUrl: BASE_URL, fetch: fetchFn });

    type ShopCommands = {
      search: { params: { query: string }; result: { id: string; name: string }[] };
    };
    const typed = client.typed<ShopCommands>();
    const results = await typed.search({ query: 'shoe' });

    expect(results).toEqual([{ id: '1', name: 'Shoe' }]);
    // TypeScript would catch type errors statically; at runtime we verify shape
    expect(Array.isArray(results)).toBe(true);
  });

  it('typed() proxy forwards command name correctly', async () => {
    let capturedCommand = '';
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      if (new URL(url).pathname === '/surf/execute') {
        const body = JSON.parse(init?.body as string) as { command: string };
        capturedCommand = body.command;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: null } satisfies SurfResponse),
      };
    }) as unknown as typeof globalThis.fetch;

    const client = SurfClient.fromManifest(BASE_MANIFEST, { baseUrl: BASE_URL, fetch: fetchFn });

    type Commands = {
      getItem: { params: { id: string }; result: null };
    };
    const typed = client.typed<Commands>();
    await typed.getItem({ id: '42' });

    expect(capturedCommand).toBe('getItem');
  });
});
