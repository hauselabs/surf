import { describe, it, expect } from 'vitest';
import { CommandRegistry } from '../src/commands.js';

describe('strictParams', () => {
  const commands = {
    greet: {
      description: 'Greet someone',
      params: {
        name: { type: 'string' as const, required: true },
      },
      run: async (p: Record<string, unknown>) => `Hello, ${p.name}`,
    },
    noParams: {
      description: 'Takes no params',
      run: async () => 'ok',
    },
  };

  describe('global strictParams', () => {
    it('rejects unexpected parameters when enabled', async () => {
      const registry = new CommandRegistry(commands, { strictParams: true });

      const result = await registry.execute('greet', { name: 'Alice', extra: 'bad' }, {});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_PARAMS');
        expect(result.error.message).toContain("Unexpected parameter 'extra'");
      }
    });

    it('allows valid parameters when enabled', async () => {
      const registry = new CommandRegistry(commands, { strictParams: true });

      const result = await registry.execute('greet', { name: 'Alice' }, {});
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result).toBe('Hello, Alice');
      }
    });

    it('rejects any params on no-schema command when enabled', async () => {
      const registry = new CommandRegistry(commands, { strictParams: true });

      const result = await registry.execute('noParams', { sneaky: 'value' }, {});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_PARAMS');
        expect(result.error.message).toContain("Unexpected parameter 'sneaky'");
      }
    });

    it('allows empty params on no-schema command when enabled', async () => {
      const registry = new CommandRegistry(commands, { strictParams: true });

      const result = await registry.execute('noParams', {}, {});
      expect(result.ok).toBe(true);
    });

    it('allows undefined params on no-schema command when enabled', async () => {
      const registry = new CommandRegistry(commands, { strictParams: true });

      const result = await registry.execute('noParams', undefined, {});
      expect(result.ok).toBe(true);
    });

    it('ignores unexpected parameters when disabled (default)', async () => {
      const registry = new CommandRegistry(commands);

      const result = await registry.execute('greet', { name: 'Alice', extra: 'fine' }, {});
      expect(result.ok).toBe(true);
    });
  });

  describe('per-command strictParams', () => {
    it('overrides global=false with command=true', async () => {
      const registry = new CommandRegistry(
        {
          strict: {
            description: 'Strict command',
            params: { name: { type: 'string' as const, required: true } },
            strictParams: true,
            run: async (p: Record<string, unknown>) => p.name,
          },
          loose: {
            description: 'Loose command',
            params: { name: { type: 'string' as const, required: true } },
            run: async (p: Record<string, unknown>) => p.name,
          },
        },
        { strictParams: false },
      );

      // Strict command rejects extra params
      const strictResult = await registry.execute('strict', { name: 'Bob', extra: 'bad' }, {});
      expect(strictResult.ok).toBe(false);
      if (!strictResult.ok) {
        expect(strictResult.error.code).toBe('INVALID_PARAMS');
      }

      // Loose command allows extra params
      const looseResult = await registry.execute('loose', { name: 'Bob', extra: 'fine' }, {});
      expect(looseResult.ok).toBe(true);
    });

    it('overrides global=true with command=false', async () => {
      const registry = new CommandRegistry(
        {
          relaxed: {
            description: 'Relaxed command',
            params: { name: { type: 'string' as const, required: true } },
            strictParams: false,
            run: async (p: Record<string, unknown>) => p.name,
          },
        },
        { strictParams: true },
      );

      const result = await registry.execute('relaxed', { name: 'Bob', extra: 'allowed' }, {});
      expect(result.ok).toBe(true);
    });
  });

  describe('reports multiple unexpected params', () => {
    it('lists all unexpected params in error', async () => {
      const registry = new CommandRegistry(commands, { strictParams: true });

      const result = await registry.execute('greet', { name: 'Alice', foo: 1, bar: 2 }, {});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("Unexpected parameter 'foo'");
        expect(result.error.message).toContain("Unexpected parameter 'bar'");
      }
    });
  });
});
