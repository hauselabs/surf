#!/usr/bin/env node
/**
 * Surf Performance Benchmark Suite
 *
 * Measures core operations: command execution, middleware overhead,
 * parameter validation, and session lifecycle.
 *
 * Usage: node --import tsx benchmarks/run.ts
 */

import {
  CommandRegistry,
  validateParams,
  InMemorySessionStore,
  runMiddlewarePipeline,
} from '../packages/core/src/index.js';
import type {
  SurfMiddleware,
  MiddlewareContext,
  ParamSchema,
  CommandDefinition,
} from '../packages/core/src/index.js';

// ─── Benchmark Harness ───────────────────────────────────────────────────────

interface BenchResult {
  name: string;
  ops: number;
  meanMs: number;
  p99Ms: number;
  totalMs: number;
}

async function bench(
  name: string,
  fn: () => void | Promise<void>,
  opts: { warmup?: number; duration?: number } = {},
): Promise<BenchResult> {
  const warmup = opts.warmup ?? 500;
  const targetMs = opts.duration ?? 3000;

  // Warmup
  for (let i = 0; i < warmup; i++) {
    await fn();
  }

  // Collect individual timings
  const timings: number[] = [];
  const start = performance.now();
  let elapsed = 0;

  while (elapsed < targetMs) {
    const t0 = performance.now();
    await fn();
    const t1 = performance.now();
    timings.push(t1 - t0);
    elapsed = t1 - start;
  }

  const totalMs = performance.now() - start;
  const ops = timings.length;

  // Sort for percentiles
  timings.sort((a, b) => a - b);
  const meanMs = timings.reduce((s, t) => s + t, 0) / ops;
  const p99Ms = timings[Math.floor(ops * 0.99)] ?? meanMs;

  return { name, ops, meanMs, p99Ms, totalMs };
}

function formatResults(results: BenchResult[]): void {
  const divider = '─'.repeat(78);
  console.log();
  console.log('  🏄 Surf Performance Benchmarks');
  console.log(`  ${divider}`);
  console.log(
    '  ' +
      'Benchmark'.padEnd(38) +
      'ops/sec'.padStart(10) +
      'mean'.padStart(10) +
      'p99'.padStart(10) +
      'samples'.padStart(10),
  );
  console.log(`  ${divider}`);

  for (const r of results) {
    const opsPerSec = Math.round(r.ops / (r.totalMs / 1000));
    const mean = r.meanMs < 1 ? `${(r.meanMs * 1000).toFixed(0)}µs` : `${r.meanMs.toFixed(2)}ms`;
    const p99 = r.p99Ms < 1 ? `${(r.p99Ms * 1000).toFixed(0)}µs` : `${r.p99Ms.toFixed(2)}ms`;

    console.log(
      '  ' +
        r.name.padEnd(38) +
        opsPerSec.toLocaleString().padStart(10) +
        mean.padStart(10) +
        p99.padStart(10) +
        r.ops.toLocaleString().padStart(10),
    );
  }

  console.log(`  ${divider}`);
  console.log();
}

// ─── Benchmarks ──────────────────────────────────────────────────────────────

async function benchCommandExecution(): Promise<BenchResult> {
  const registry = new CommandRegistry({
    echo: {
      description: 'Echo benchmark',
      params: {
        message: { type: 'string', required: true, description: 'Input' },
      },
      run: (params: Record<string, unknown>) => ({ echoed: params.message }),
    } as CommandDefinition,
  });

  return bench('command execution (echo)', async () => {
    await registry.execute('echo', { message: 'hello' }, {});
  });
}

async function benchCommandWithValidation(): Promise<BenchResult> {
  const registry = new CommandRegistry({
    create: {
      description: 'Create with validation',
      params: {
        name: { type: 'string', required: true, description: 'Name' },
        email: { type: 'string', required: true, description: 'Email' },
        age: { type: 'number', description: 'Age' },
        active: { type: 'boolean', description: 'Active' },
      },
      run: (params: Record<string, unknown>) => ({ id: 1, ...params }),
    } as CommandDefinition,
  });

  return bench('command + param validation', async () => {
    await registry.execute(
      'create',
      { name: 'Alice', email: 'alice@example.com', age: 30, active: true },
      {},
    );
  });
}

async function benchMiddlewareChain(count: number): Promise<BenchResult> {
  const middlewares: SurfMiddleware[] = [];
  for (let i = 0; i < count; i++) {
    middlewares.push(async (_ctx, next) => {
      await next();
    });
  }

  return bench(`middleware chain (${count} layers)`, async () => {
    const ctx: MiddlewareContext = {
      command: 'test',
      params: { a: 1 },
      context: { auth: undefined, headers: {}, transport: 'http' },
    };
    await runMiddlewarePipeline(middlewares, ctx, async () => {
      ctx.result = { ok: true, data: null };
    });
  });
}

async function benchMiddlewareWithWork(count: number): Promise<BenchResult> {
  const middlewares: SurfMiddleware[] = [];
  for (let i = 0; i < count; i++) {
    middlewares.push(async (ctx, next) => {
      // Simulate real middleware work: header inspection, logging, auth check
      ctx.params = { ...ctx.params, [`mw_${i}`]: true };
      await next();
    });
  }

  return bench(`middleware + work (${count} layers)`, async () => {
    const ctx: MiddlewareContext = {
      command: 'test',
      params: { a: 1 },
      context: { auth: undefined, headers: {}, transport: 'http' },
    };
    await runMiddlewarePipeline(middlewares, ctx, async () => {
      ctx.result = { ok: true, data: null };
    });
  });
}

async function benchValidation(
  label: string,
  schema: Record<string, ParamSchema>,
  params: Record<string, unknown>,
): Promise<BenchResult> {
  return bench(`param validation (${label})`, () => {
    validateParams(params, schema);
  });
}

async function benchSessionLifecycle(): Promise<BenchResult> {
  const store = new InMemorySessionStore({ ttlMs: 60_000, maxSessions: 100_000 });

  return bench('session create→get→update→destroy', async () => {
    const session = await store.create();
    await store.get(session.id);
    await store.update(session.id, { counter: 1 });
    await store.destroy(session.id);
  });
}

async function benchSessionCreateOnly(): Promise<BenchResult> {
  const store = new InMemorySessionStore({ ttlMs: 60_000, maxSessions: 100_000 });

  return bench('session create (isolated)', async () => {
    await store.create();
  });
}

async function benchCommandWithMiddleware(): Promise<BenchResult> {
  const logMiddleware: SurfMiddleware = async (_ctx, next) => {
    await next();
  };

  const authMiddleware: SurfMiddleware = async (ctx, next) => {
    ctx.context = { ...ctx.context, auth: { id: 'user-1' } };
    await next();
  };

  const registry = new CommandRegistry({
    greet: {
      description: 'Greet with middleware',
      params: {
        name: { type: 'string', required: true, description: 'Name' },
      },
      run: (params: Record<string, unknown>) => ({
        greeting: `Hello, ${params.name}`,
      }),
    } as CommandDefinition,
  });

  registry.setMiddleware([logMiddleware, authMiddleware]);

  return bench('command + 2 middleware', async () => {
    await registry.execute('greet', { name: 'World' }, {});
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('  Running Surf benchmarks...\n');

  const results: BenchResult[] = [];

  // Command execution
  results.push(await benchCommandExecution());
  results.push(await benchCommandWithValidation());
  results.push(await benchCommandWithMiddleware());

  // Middleware chain overhead (passthrough)
  results.push(await benchMiddlewareChain(1));
  results.push(await benchMiddlewareChain(5));
  results.push(await benchMiddlewareChain(10));

  // Middleware with real work
  results.push(await benchMiddlewareWithWork(5));

  // Param validation
  results.push(
    await benchValidation(
      'simple',
      {
        name: { type: 'string', required: true, description: 'Name' },
        age: { type: 'number', description: 'Age' },
      },
      { name: 'Alice', age: 30 },
    ),
  );
  results.push(
    await benchValidation(
      'complex/nested',
      {
        user: {
          type: 'object',
          required: true,
          description: 'User',
          properties: {
            name: { type: 'string', required: true, description: 'Name' },
            email: { type: 'string', required: true, description: 'Email' },
            age: { type: 'number', description: 'Age' },
          },
        },
        tags: {
          type: 'array',
          description: 'Tags',
          items: { type: 'string', description: 'Tag' },
        },
        active: { type: 'boolean', description: 'Active' },
      },
      {
        user: { name: 'Alice', email: 'alice@example.com', age: 30 },
        tags: ['admin', 'user', 'editor'],
        active: true,
      },
    ),
  );

  // Session lifecycle
  results.push(await benchSessionCreateOnly());
  results.push(await benchSessionLifecycle());

  formatResults(results);
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
