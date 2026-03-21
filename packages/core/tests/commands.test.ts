import { describe, it, expect, vi } from 'vitest';
import { CommandRegistry } from '../src/commands.js';
import type { CommandDefinition, CommandGroup } from '../src/types.js';

describe('CommandRegistry', () => {
  it('registers a command and executes it', async () => {
    const registry = new CommandRegistry({
      greet: {
        description: 'Say hello',
        params: { name: { type: 'string', required: true } },
        run: async (p) => `Hello, ${p.name}!`,
      },
    });

    const result = await registry.execute('greet', { name: 'World' }, {});
    expect(result).toEqual({
      ok: true,
      requestId: undefined,
      result: 'Hello, World!',
    });
  });

  it('validates required params and throws on missing', async () => {
    const registry = new CommandRegistry({
      greet: {
        description: 'Say hello',
        params: { name: { type: 'string', required: true } },
        run: async (p) => `Hello, ${p.name}!`,
      },
    });

    const result = await registry.execute('greet', {}, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_PARAMS');
    }
  });

  it('validates type checking (string vs number)', async () => {
    const registry = new CommandRegistry({
      add: {
        description: 'Add numbers',
        params: { a: { type: 'number', required: true } },
        run: async (p) => p.a,
      },
    });

    const result = await registry.execute('add', { a: 'not-a-number' }, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_PARAMS');
      expect(result.error.message).toContain('number');
    }
  });

  it('resolves dot-notation namespace commands', async () => {
    const commands: Record<string, CommandDefinition | CommandGroup> = {
      cart: {
        add: {
          description: 'Add to cart',
          params: { item: { type: 'string', required: true } },
          run: async (p) => ({ added: p.item }),
        } as CommandDefinition,
        remove: {
          description: 'Remove from cart',
          run: async () => ({ removed: true }),
        } as CommandDefinition,
      },
    };

    const registry = new CommandRegistry(commands);
    expect(registry.has('cart.add')).toBe(true);
    expect(registry.has('cart.remove')).toBe(true);
    expect(registry.has('cart')).toBe(false);

    const result = await registry.execute('cart.add', { item: 'shoes' }, {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result).toEqual({ added: 'shoes' });
    }
  });

  it('applies default param values', async () => {
    const registry = new CommandRegistry({
      greet: {
        description: 'Say hello',
        params: {
          name: { type: 'string', required: true },
          greeting: { type: 'string', default: 'Hello' },
        },
        run: async (p) => `${p.greeting}, ${p.name}!`,
      },
    });

    const result = await registry.execute('greet', { name: 'World' }, {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result).toBe('Hello, World!');
    }
  });

  it('returns UNKNOWN_COMMAND for non-existent command', async () => {
    const registry = new CommandRegistry({
      ping: { description: 'Ping', run: async () => 'pong' },
    });

    const result = await registry.execute('nope', {}, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UNKNOWN_COMMAND');
    }
  });

  it('executes middleware in order', async () => {
    const order: string[] = [];

    const registry = new CommandRegistry({
      test: { description: 'Test', run: async () => 'done' },
    });

    registry.setMiddleware([
      async (ctx, next) => {
        order.push('mw1-before');
        await next();
        order.push('mw1-after');
      },
      async (ctx, next) => {
        order.push('mw2-before');
        await next();
        order.push('mw2-after');
      },
    ]);

    await registry.execute('test', {}, {});
    expect(order).toEqual(['mw1-before', 'mw2-before', 'mw2-after', 'mw1-after']);
  });

  it('handles command that throws an error', async () => {
    const registry = new CommandRegistry({
      fail: {
        description: 'Fail',
        run: async () => { throw new Error('boom'); },
      },
    });

    const result = await registry.execute('fail', {}, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INTERNAL_ERROR');
      expect(result.error.message).toBe('boom');
    }
  });
});
