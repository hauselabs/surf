import { describe, it, expect, vi } from 'vitest';
import { SurfClient, SurfClientError } from '../src/client.js';
import type { SurfManifest, SurfResponse } from '../src/types.js';

const testManifest: SurfManifest = {
  surf: '0.1.0',
  name: 'TestShop',
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
  },
  checksum: 'abc123',
  updatedAt: '2024-01-01T00:00:00Z',
};

function createMockFetch(responses: Record<string, unknown>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;

    if (path === '/.well-known/surf.json') {
      return {
        ok: true,
        status: 200,
        json: async () => testManifest,
        text: async () => JSON.stringify(testManifest),
      };
    }

    if (path === '/surf/execute') {
      const body = JSON.parse((init?.body as string) ?? '{}');
      const responseData = responses[body.command];
      if (!responseData) {
        return {
          ok: true,
          status: 404,
          json: async () => ({
            ok: false,
            error: { code: 'UNKNOWN_COMMAND', message: `Unknown: ${body.command}` },
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          result: responseData,
        } as SurfResponse),
      };
    }

    if (path === '/surf/pipeline') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          results: [{ command: 'search', ok: true, result: [] }],
        }),
      };
    }

    if (path === '/surf/session/start') {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, sessionId: 'sess_test' }),
      };
    }

    if (path === '/surf/session/end') {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      };
    }

    return { ok: false, status: 404 };
  }) as unknown as typeof globalThis.fetch;
}

describe('SurfClient', () => {
  it('discovers manifest and returns a client', async () => {
    const mockFetch = createMockFetch({});
    const client = await SurfClient.discover('http://localhost:3000', { fetch: mockFetch });

    expect(client.manifest.name).toBe('TestShop');
    expect(client.commands()).toBeDefined();
    expect(client.command('search')?.description).toBe('Search products');
  });

  it('execute sends POST to /surf/execute', async () => {
    const mockFetch = createMockFetch({ search: [{ id: 1, name: 'Shoes' }] });
    const client = SurfClient.fromManifest(testManifest, { baseUrl: 'http://localhost:3000', fetch: mockFetch });

    const result = await client.execute('search', { query: 'shoes' });
    expect(result).toEqual([{ id: 1, name: 'Shoes' }]);

    // Verify the fetch call
    const calls = mockFetch.mock.calls;
    const executeCall = calls.find((c: unknown[]) => (c[0] as string).includes('/surf/execute'));
    expect(executeCall).toBeDefined();
    const body = JSON.parse((executeCall![1] as RequestInit).body as string);
    expect(body.command).toBe('search');
    expect(body.params).toEqual({ query: 'shoes' });
  });

  it('pipeline sends POST to /surf/pipeline', async () => {
    const mockFetch = createMockFetch({});
    const client = SurfClient.fromManifest(testManifest, { baseUrl: 'http://localhost:3000', fetch: mockFetch });

    const result = await client.pipeline([{ command: 'search', params: { query: 'shoes' } }]);
    expect(result.ok).toBe(true);
    expect(result.results).toHaveLength(1);
  });

  it('error responses throw SurfClientError', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: false,
        error: { code: 'UNKNOWN_COMMAND', message: 'Not found' },
      }),
    })) as unknown as typeof globalThis.fetch;

    const client = SurfClient.fromManifest(testManifest, { baseUrl: 'http://localhost:3000', fetch: mockFetch });

    await expect(client.execute('nonexistent')).rejects.toThrow(SurfClientError);
    try {
      await client.execute('nonexistent');
    } catch (e) {
      expect(e).toBeInstanceOf(SurfClientError);
      expect((e as SurfClientError).code).toBe('UNKNOWN_COMMAND');
    }
  });

  it('typed proxy works', async () => {
    const mockFetch = createMockFetch({ search: [{ id: 1, name: 'Shoes' }] });
    const client = SurfClient.fromManifest(testManifest, { baseUrl: 'http://localhost:3000', fetch: mockFetch });

    type Commands = {
      search: { params: { query: string }; result: { id: number; name: string }[] };
    };
    const typed = client.typed<Commands>();
    const result = await typed.search({ query: 'shoes' });
    expect(result).toEqual([{ id: 1, name: 'Shoes' }]);
  });

  it('cache prevents duplicate requests', async () => {
    const mockFetch = createMockFetch({ search: ['result'] });
    const client = SurfClient.fromManifest(testManifest, {
      baseUrl: 'http://localhost:3000',
      fetch: mockFetch,
      cache: { ttlMs: 5000, maxSize: 100 },
    });

    await client.execute('search', { query: 'shoes' });
    await client.execute('search', { query: 'shoes' });

    // execute is called twice but fetch should only be called once for execute
    // (first call is discovery or manifest, second is the actual execute)
    const executeCalls = mockFetch.mock.calls.filter(
      (c: unknown[]) => (c[0] as string).includes('/surf/execute'),
    );
    expect(executeCalls).toHaveLength(1);
  });

  it('clearCache forces fresh request', async () => {
    const mockFetch = createMockFetch({ search: ['result'] });
    const client = SurfClient.fromManifest(testManifest, {
      baseUrl: 'http://localhost:3000',
      fetch: mockFetch,
      cache: { ttlMs: 5000, maxSize: 100 },
    });

    await client.execute('search', { query: 'shoes' });
    client.clearCache();
    await client.execute('search', { query: 'shoes' });

    const executeCalls = mockFetch.mock.calls.filter(
      (c: unknown[]) => (c[0] as string).includes('/surf/execute'),
    );
    expect(executeCalls).toHaveLength(2);
  });
});
