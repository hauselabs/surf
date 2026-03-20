import { describe, it, expect } from 'vitest';
import { generateManifest } from '../src/manifest.js';
import type { SurfConfig } from '../src/types.js';

describe('generateManifest', () => {
  const config: SurfConfig = {
    name: 'TestApp',
    description: 'A test app',
    version: '1.0.0',
    baseUrl: 'https://example.com',
    commands: {
      ping: {
        description: 'Ping the server',
        run: async () => 'pong',
      },
      search: {
        description: 'Search items',
        params: {
          query: { type: 'string', required: true, description: 'Search query' },
          limit: { type: 'number', default: 10 },
        },
        returns: { type: 'array' },
        tags: ['search'],
        run: async () => [],
      },
    },
  };

  it('generates manifest from config', () => {
    const manifest = generateManifest(config);
    expect(manifest.name).toBe('TestApp');
    expect(manifest.description).toBe('A test app');
    expect(manifest.baseUrl).toBe('https://example.com');
  });

  it('includes all commands with descriptions and params', () => {
    const manifest = generateManifest(config);
    expect(manifest.commands.ping).toBeDefined();
    expect(manifest.commands.ping.description).toBe('Ping the server');
    expect(manifest.commands.search).toBeDefined();
    expect(manifest.commands.search.params?.query.required).toBe(true);
    expect(manifest.commands.search.tags).toEqual(['search']);
  });

  it('does not include run handler in manifest commands', () => {
    const manifest = generateManifest(config);
    expect((manifest.commands.ping as unknown as Record<string, unknown>).run).toBeUndefined();
  });

  it('produces a stable SHA-256 checksum', () => {
    const m1 = generateManifest(config, '2024-01-01T00:00:00Z');
    const m2 = generateManifest(config, '2024-01-01T00:00:00Z');
    expect(m1.checksum).toBe(m2.checksum);
    expect(m1.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('includes surf spec version', () => {
    const manifest = generateManifest(config);
    expect(manifest.surf).toBeDefined();
    expect(typeof manifest.surf).toBe('string');
  });

  it('includes version field from config', () => {
    const manifest = generateManifest(config);
    expect(manifest.version).toBe('1.0.0');
  });

  it('includes updatedAt timestamp', () => {
    const manifest = generateManifest(config);
    expect(manifest.updatedAt).toBeDefined();
    // Should be a valid ISO string
    expect(new Date(manifest.updatedAt).toISOString()).toBe(manifest.updatedAt);
  });

  it('flattens nested command groups to dot notation', () => {
    const nested: SurfConfig = {
      name: 'Nested',
      commands: {
        cart: {
          add: { description: 'Add', run: async () => {} } as any,
          remove: { description: 'Remove', run: async () => {} } as any,
        },
      },
    };
    const manifest = generateManifest(nested);
    expect(manifest.commands['cart.add']).toBeDefined();
    expect(manifest.commands['cart.remove']).toBeDefined();
    expect(manifest.commands['cart']).toBeUndefined();
  });
});
