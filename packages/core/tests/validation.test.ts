import { describe, it, expect } from 'vitest';
import { CommandRegistry } from '../src/commands.js';

describe('Validation', () => {
  it('validates return types in strict mode (validateReturns)', async () => {
    const registry = new CommandRegistry(
      {
        bad: {
          description: 'Returns wrong type',
          returns: { type: 'number' },
          run: async () => 'not-a-number',  // should fail
        },
      },
      { validateReturns: true },
    );

    const result = await registry.execute('bad', {}, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INTERNAL_ERROR');
      expect(result.error.message).toContain('invalid shape');
    }
  });

  it('passes validation when return type matches', async () => {
    const registry = new CommandRegistry(
      {
        good: {
          description: 'Returns correct type',
          returns: { type: 'number' },
          run: async () => 42,
        },
      },
      { validateReturns: true },
    );

    const result = await registry.execute('good', {}, {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result).toBe(42);
    }
  });

  it('no validation in non-strict mode', async () => {
    const registry = new CommandRegistry(
      {
        bad: {
          description: 'Returns wrong type',
          returns: { type: 'number' },
          run: async () => 'not-a-number',
        },
      },
      { validateReturns: false },
    );

    const result = await registry.execute('bad', {}, {});
    // Should pass because validation is disabled
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result).toBe('not-a-number');
    }
  });

  it('validates object return shape with properties', async () => {
    const registry = new CommandRegistry(
      {
        obj: {
          description: 'Returns object',
          returns: {
            type: 'object',
            properties: {
              name: { type: 'string', required: true },
              age: { type: 'number', required: true },
            },
          },
          run: async () => ({ name: 'Alice', age: 'thirty' }),  // age is wrong type
        },
      },
      { validateReturns: true },
    );

    const result = await registry.execute('obj', {}, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INTERNAL_ERROR');
    }
  });

  it('validates enum params', async () => {
    const registry = new CommandRegistry({
      pick: {
        description: 'Pick a color',
        params: {
          color: { type: 'string', required: true, enum: ['red', 'green', 'blue'] },
        },
        run: async (p) => p.color,
      },
    });

    const bad = await registry.execute('pick', { color: 'yellow' }, {});
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error.code).toBe('INVALID_PARAMS');
    }

    const good = await registry.execute('pick', { color: 'red' }, {});
    expect(good.ok).toBe(true);
  });
});
