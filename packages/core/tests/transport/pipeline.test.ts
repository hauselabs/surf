import { describe, it, expect } from 'vitest';
import { executePipeline } from '../../src/transport/pipeline.js';
import { CommandRegistry } from '../../src/commands.js';
import { InMemorySessionStore } from '../../src/session.js';

describe('Pipeline', () => {
  function createRegistry() {
    return new CommandRegistry({
      add: {
        description: 'Add two numbers',
        params: {
          a: { type: 'number', required: true },
          b: { type: 'number', required: true },
        },
        run: async (p) => (p.a as number) + (p.b as number),
      },
      double: {
        description: 'Double a number',
        params: { n: { type: 'number', required: true } },
        run: async (p) => (p.n as number) * 2,
      },
      fail: {
        description: 'Always fails',
        run: async () => { throw new Error('intentional'); },
      },
      echo: {
        description: 'Echo input',
        params: { value: { type: 'string' } },
        run: async (p) => p.value,
      },
    });
  }

  it('executes steps sequentially', async () => {
    const registry = createRegistry();
    const sessions = new InMemorySessionStore();

    const result = await executePipeline(
      {
        steps: [
          { command: 'add', params: { a: 1, b: 2 } },
          { command: 'double', params: { n: 5 } },
        ],
      },
      registry,
      sessions,
    );

    expect(result.ok).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].result).toBe(3);
    expect(result.results[1].result).toBe(10);
  });

  it('step results passed to next step via $prev (alias references)', async () => {
    const registry = createRegistry();
    const sessions = new InMemorySessionStore();

    const result = await executePipeline(
      {
        steps: [
          { command: 'add', params: { a: 3, b: 4 }, as: 'sum' },
          { command: 'double', params: { n: '$sum' } },
        ],
      },
      registry,
      sessions,
    );

    expect(result.ok).toBe(true);
    expect(result.results[0].result).toBe(7);
    expect(result.results[1].result).toBe(14);
  });

  it('pipeline aborts on error by default', async () => {
    const registry = createRegistry();
    const sessions = new InMemorySessionStore();

    const result = await executePipeline(
      {
        steps: [
          { command: 'add', params: { a: 1, b: 2 } },
          { command: 'fail' },
          { command: 'double', params: { n: 5 } },  // should not run
        ],
      },
      registry,
      sessions,
    );

    expect(result.ok).toBe(false);
    expect(result.results).toHaveLength(2);  // only first two steps
    expect(result.results[0].ok).toBe(true);
    expect(result.results[1].ok).toBe(false);
  });

  it('pipeline continues on error with continueOnError', async () => {
    const registry = createRegistry();
    const sessions = new InMemorySessionStore();

    const result = await executePipeline(
      {
        steps: [
          { command: 'add', params: { a: 1, b: 2 } },
          { command: 'fail' },
          { command: 'double', params: { n: 5 } },
        ],
        continueOnError: true,
      },
      registry,
      sessions,
    );

    expect(result.ok).toBe(false);  // overall not ok because one step failed
    expect(result.results).toHaveLength(3);  // all three ran
    expect(result.results[2].ok).toBe(true);
    expect(result.results[2].result).toBe(10);
  });

  it('empty pipeline returns ok with no results', async () => {
    const registry = createRegistry();
    const sessions = new InMemorySessionStore();

    const result = await executePipeline(
      { steps: [] },
      registry,
      sessions,
    );

    expect(result.ok).toBe(true);
    expect(result.results).toHaveLength(0);
  });
});
