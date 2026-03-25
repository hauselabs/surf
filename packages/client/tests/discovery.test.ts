import { describe, it, expect, vi } from 'vitest';
import { discoverManifest } from '../src/discovery.js';
import type { SurfManifest } from '../src/types.js';

const testManifest: SurfManifest = {
  surf: '0.1.0',
  name: 'TestShop',
  commands: {
    search: { description: 'Search products' },
  },
  checksum: 'abc123',
  updatedAt: '2024-01-01T00:00:00Z',
};

describe('discoverManifest', () => {
  it('fetches /.well-known/surf.json', async () => {
    const mockFetch = vi.fn(async (url: string) => {
      if (url.includes('/.well-known/surf.json')) {
        return {
          ok: true,
          status: 200,
          json: async () => testManifest,
          text: async () => JSON.stringify(testManifest),
        };
      }
      return { ok: false, status: 404 };
    }) as unknown as typeof globalThis.fetch;

    const manifest = await discoverManifest('http://localhost:3000', mockFetch);
    expect(manifest.name).toBe('TestShop');
    expect(manifest.commands.search).toBeDefined();
  });

  it('throws on invalid manifest (missing surf field)', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ name: 'NoSurfField', commands: {} }),
    })) as unknown as typeof globalThis.fetch;

    await expect(discoverManifest('http://localhost:3000', mockFetch)).rejects.toThrow(
      /missing required fields/i,
    );
  });

  it('falls back to HTML meta tag discovery', async () => {
    let callCount = 0;
    const mockFetch = vi.fn(async (url: string) => {
      callCount++;
      if (url.includes('/.well-known/surf.json') && callCount === 1) {
        return { ok: false, status: 404, statusText: 'Not Found' };
      }
      if (url.endsWith('/')) {
        return {
          ok: true,
          text: async () => `<html><head><meta name="surf" content="/api/surf.json"></head></html>`,
        };
      }
      if (url.includes('/api/surf.json')) {
        return {
          ok: true,
          json: async () => testManifest,
        };
      }
      return { ok: false, status: 404, statusText: 'Not Found' };
    }) as unknown as typeof globalThis.fetch;

    const manifest = await discoverManifest('http://localhost:3000', mockFetch);
    expect(manifest.name).toBe('TestShop');
  });

  it('passes Authorization header when auth token is provided', async () => {
    const capturedHeaders: Record<string, string>[] = [];
    const mockFetch = vi.fn(async (url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | undefined;
      if (headers) capturedHeaders.push({ ...headers });
      if (url.includes('/.well-known/surf.json')) {
        return {
          ok: true,
          status: 200,
          json: async () => testManifest,
          text: async () => JSON.stringify(testManifest),
        };
      }
      return { ok: false, status: 404 };
    }) as unknown as typeof globalThis.fetch;

    await discoverManifest('http://localhost:3000', mockFetch, 5000, 'my-secret-token');

    expect(capturedHeaders.length).toBeGreaterThanOrEqual(1);
    expect(capturedHeaders[0]['Authorization']).toBe('Bearer my-secret-token');
  });

  it('does not send Authorization header when auth is not provided', async () => {
    const capturedHeaders: Record<string, string>[] = [];
    const mockFetch = vi.fn(async (url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | undefined;
      if (headers) capturedHeaders.push({ ...headers });
      if (url.includes('/.well-known/surf.json')) {
        return {
          ok: true,
          status: 200,
          json: async () => testManifest,
          text: async () => JSON.stringify(testManifest),
        };
      }
      return { ok: false, status: 404 };
    }) as unknown as typeof globalThis.fetch;

    await discoverManifest('http://localhost:3000', mockFetch);

    expect(capturedHeaders.length).toBeGreaterThanOrEqual(1);
    expect(capturedHeaders[0]['Authorization']).toBeUndefined();
  });

  it('passes Authorization header to all fetch calls including fallback', async () => {
    const capturedHeaders: Record<string, string>[] = [];
    let callCount = 0;
    const mockFetch = vi.fn(async (url: string, init?: RequestInit) => {
      callCount++;
      const headers = init?.headers as Record<string, string> | undefined;
      if (headers) capturedHeaders.push({ ...headers });
      if (url.includes('/.well-known/surf.json') && callCount === 1) {
        return { ok: false, status: 404, statusText: 'Not Found' };
      }
      if (url.endsWith('/')) {
        return {
          ok: true,
          text: async () => `<html><head><meta name="surf" content="/api/surf.json"></head></html>`,
        };
      }
      if (url.includes('/api/surf.json')) {
        return {
          ok: true,
          json: async () => testManifest,
        };
      }
      return { ok: false, status: 404, statusText: 'Not Found' };
    }) as unknown as typeof globalThis.fetch;

    await discoverManifest('http://localhost:3000', mockFetch, 5000, 'my-secret-token');

    // All three fetch calls should have the auth header
    expect(capturedHeaders.length).toBe(3);
    for (const headers of capturedHeaders) {
      expect(headers['Authorization']).toBe('Bearer my-secret-token');
    }
  });

  it('throws when manifest cannot be found anywhere', async () => {
    const mockFetch = vi.fn(async (url: string) => {
      if (url.endsWith('/')) {
        return {
          ok: true,
          text: async () => `<html><head></head><body>No surf here</body></html>`,
        };
      }
      return { ok: false, status: 404, statusText: 'Not Found' };
    }) as unknown as typeof globalThis.fetch;

    await expect(discoverManifest('http://localhost:3000', mockFetch)).rejects.toThrow();
  });
});
