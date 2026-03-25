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

  it('generates manifest from config', async () => {
    const manifest = await generateManifest(config);
    expect(manifest.name).toBe('TestApp');
    expect(manifest.description).toBe('A test app');
    expect(manifest.baseUrl).toBe('https://example.com');
  });

  it('includes all commands with descriptions and params', async () => {
    const manifest = await generateManifest(config);
    expect(manifest.commands.ping).toBeDefined();
    expect(manifest.commands.ping.description).toBe('Ping the server');
    expect(manifest.commands.search).toBeDefined();
    expect(manifest.commands.search.params?.query.required).toBe(true);
    expect(manifest.commands.search.tags).toEqual(['search']);
  });

  it('does not include run handler in manifest commands', async () => {
    const manifest = await generateManifest(config);
    expect((manifest.commands.ping as unknown as Record<string, unknown>).run).toBeUndefined();
  });

  it('produces a stable SHA-256 checksum', async () => {
    const m1 = await generateManifest(config, '2024-01-01T00:00:00Z');
    const m2 = await generateManifest(config, '2024-01-01T00:00:00Z');
    expect(m1.checksum).toBe(m2.checksum);
    expect(m1.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('includes surf spec version', async () => {
    const manifest = await generateManifest(config);
    expect(manifest.surf).toBeDefined();
    expect(typeof manifest.surf).toBe('string');
  });

  it('includes version field from config', async () => {
    const manifest = await generateManifest(config);
    expect(manifest.version).toBe('1.0.0');
  });

  it('includes updatedAt timestamp', async () => {
    const manifest = await generateManifest(config);
    expect(manifest.updatedAt).toBeDefined();
    // Should be a valid ISO string
    expect(new Date(manifest.updatedAt).toISOString()).toBe(manifest.updatedAt);
  });

  it('includes channels in manifest when configured', async () => {
    const configWithChannels: SurfConfig = {
      ...config,
      channels: {
        'game:lobby': {
          description: 'Lobby state for matchmaking',
          stateSchema: {
            players: { type: 'array', description: 'Current players in lobby' },
            status: { type: 'string', enum: ['waiting', 'starting', 'full'] },
          },
          initialState: { players: [], status: 'waiting' },
        },
        notifications: {
          description: 'Real-time notification feed',
        },
      },
    };
    const manifest = await generateManifest(configWithChannels);
    expect(manifest.channels).toBeDefined();
    expect(manifest.channels!['game:lobby'].description).toBe('Lobby state for matchmaking');
    expect(manifest.channels!['game:lobby'].stateSchema).toBeDefined();
    expect(manifest.channels!['game:lobby'].stateSchema!['players'].type).toBe('array');
    expect(manifest.channels!['notifications'].description).toBe('Real-time notification feed');
    expect(manifest.channels!['notifications'].stateSchema).toBeUndefined();
  });

  it('strips initialState from channel manifest (runtime-only data)', async () => {
    const configWithChannels: SurfConfig = {
      ...config,
      channels: {
        counter: {
          description: 'A counter channel',
          stateSchema: { count: { type: 'number' } },
          initialState: { count: 0 },
        },
      },
    };
    const manifest = await generateManifest(configWithChannels);
    const channel = manifest.channels!['counter'];
    expect(channel.description).toBe('A counter channel');
    expect(channel.stateSchema).toEqual({ count: { type: 'number' } });
    expect((channel as Record<string, unknown>)['initialState']).toBeUndefined();
  });

  it('omits channels from manifest when not configured', async () => {
    const manifest = await generateManifest(config);
    expect(manifest.channels).toBeUndefined();
  });

  it('flattens nested command groups to dot notation', async () => {
    const nested: SurfConfig = {
      name: 'Nested',
      commands: {
        cart: {
          add: { description: 'Add', run: async () => {} } as any,
          remove: { description: 'Remove', run: async () => {} } as any,
        },
      },
    };
    const manifest = await generateManifest(nested);
    expect(manifest.commands['cart.add']).toBeDefined();
    expect(manifest.commands['cart.remove']).toBeDefined();
    expect(manifest.commands['cart']).toBeUndefined();
  });
});
