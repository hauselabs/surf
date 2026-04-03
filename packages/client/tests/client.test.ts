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
    expect(client.commands).toBeDefined();
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

  it('cache uses LRU eviction, not FIFO', async () => {
    // Manifest with 4 commands so we can test eviction ordering
    const lruManifest: SurfManifest = {
      ...testManifest,
      commands: {
        cmd_a: { description: 'A' },
        cmd_b: { description: 'B' },
        cmd_c: { description: 'C' },
        cmd_d: { description: 'D' },
      },
    };

    const mockFetch = createMockFetch({
      cmd_a: 'result_a',
      cmd_b: 'result_b',
      cmd_c: 'result_c',
      cmd_d: 'result_d',
    });

    const client = SurfClient.fromManifest(lruManifest, {
      baseUrl: 'http://localhost:3000',
      fetch: mockFetch,
      cache: { ttlMs: 60000, maxSize: 3 },
    });

    // Fill cache: A, B, C (cache is now at maxSize 3)
    await client.execute('cmd_a');
    await client.execute('cmd_b');
    await client.execute('cmd_c');

    // Access A again — promotes it in LRU order
    await client.execute('cmd_a'); // should be cached, no new fetch

    // Insert D — should evict B (least recently used), NOT A (which was just accessed)
    await client.execute('cmd_d');

    // Reset mock call count to isolate the next calls
    mockFetch.mockClear();

    // Re-create the mock to still return correct responses
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      if (path === '/surf/execute') {
        const body = JSON.parse((init?.body as string) ?? '{}');
        const responses: Record<string, string> = {
          cmd_a: 'result_a',
          cmd_b: 'result_b',
          cmd_c: 'result_c',
          cmd_d: 'result_d',
        };
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, result: responses[body.command] }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    // A should still be cached (was promoted via LRU)
    await client.execute('cmd_a');
    const aFetches = mockFetch.mock.calls.filter(
      (c: unknown[]) => (c[0] as string).includes('/surf/execute'),
    );
    expect(aFetches).toHaveLength(0); // A is in cache

    // B should have been evicted (it was the LRU entry)
    await client.execute('cmd_b');
    const bFetches = mockFetch.mock.calls.filter(
      (c: unknown[]) => {
        if (!(c[0] as string).includes('/surf/execute')) return false;
        const body = JSON.parse((c[1] as { body: string })?.body ?? '{}');
        return body.command === 'cmd_b';
      },
    );
    expect(bFetches).toHaveLength(1); // B was evicted, needs re-fetch
  });

  it('cache evicts oldest entry when no LRU promotion occurs', async () => {
    const lruManifest: SurfManifest = {
      ...testManifest,
      commands: {
        cmd_x: { description: 'X' },
        cmd_y: { description: 'Y' },
        cmd_z: { description: 'Z' },
      },
    };

    const mockFetch = createMockFetch({
      cmd_x: 'result_x',
      cmd_y: 'result_y',
      cmd_z: 'result_z',
    });

    const client = SurfClient.fromManifest(lruManifest, {
      baseUrl: 'http://localhost:3000',
      fetch: mockFetch,
      cache: { ttlMs: 60000, maxSize: 2 },
    });

    // Fill cache: X, Y (maxSize 2)
    await client.execute('cmd_x');
    await client.execute('cmd_y');

    // Insert Z — should evict X (oldest, no promotion happened)
    await client.execute('cmd_z');

    // Count total execute calls so far: X, Y, Z = 3
    const preFetches = mockFetch.mock.calls.filter(
      (c: unknown[]) => (c[0] as string).includes('/surf/execute'),
    );
    expect(preFetches).toHaveLength(3);

    // Y should still be cached (second most recent)
    await client.execute('cmd_y');
    // Z should still be cached (most recent)
    await client.execute('cmd_z');

    // No new fetches — both Y and Z were in cache
    const postFetches = mockFetch.mock.calls.filter(
      (c: unknown[]) => (c[0] as string).includes('/surf/execute'),
    );
    expect(postFetches).toHaveLength(3); // unchanged

    // X should be evicted — needs a re-fetch
    await client.execute('cmd_x');
    const finalFetches = mockFetch.mock.calls.filter(
      (c: unknown[]) => (c[0] as string).includes('/surf/execute'),
    );
    expect(finalFetches).toHaveLength(4); // one new fetch for evicted X
  });
});
