import { describe, it, expect, vi } from 'vitest';
import { runMiddlewarePipeline } from '../src/middleware.js';
import { CommandRegistry } from '../src/commands.js';
import { SurfError } from '../src/errors.js';
import type { MiddlewareContext, SurfMiddleware } from '../src/middleware.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<MiddlewareContext> = {}): MiddlewareContext {
  return {
    command: 'test',
    params: {},
    context: {},
    result: undefined,
    error: undefined,
    ...overrides,
  };
}

// ─── runMiddlewarePipeline ────────────────────────────────────────────────────

describe('runMiddlewarePipeline – execution order', () => {
  it('runs single middleware and calls inner', async () => {
    const log: string[] = [];
    const ctx = makeCtx();

    await runMiddlewarePipeline(
      [async (_c, next) => { log.push('before'); await next(); log.push('after'); }],
      ctx,
      async () => { log.push('inner'); },
    );

    expect(log).toEqual(['before', 'inner', 'after']);
  });

  it('executes two middlewares in correct onion order', async () => {
    const log: string[] = [];
    const ctx = makeCtx();

    await runMiddlewarePipeline(
      [
        async (_c, next) => { log.push('mw1-before'); await next(); log.push('mw1-after'); },
        async (_c, next) => { log.push('mw2-before'); await next(); log.push('mw2-after'); },
      ],
      ctx,
      async () => { log.push('inner'); },
    );

    expect(log).toEqual(['mw1-before', 'mw2-before', 'inner', 'mw2-after', 'mw1-after']);
  });

  it('executes three middlewares in correct order', async () => {
    const log: string[] = [];
    const ctx = makeCtx();

    await runMiddlewarePipeline(
      [
        async (_c, next) => { log.push('1-in'); await next(); log.push('1-out'); },
        async (_c, next) => { log.push('2-in'); await next(); log.push('2-out'); },
        async (_c, next) => { log.push('3-in'); await next(); log.push('3-out'); },
      ],
      ctx,
      async () => { log.push('inner'); },
    );

    expect(log).toEqual(['1-in', '2-in', '3-in', 'inner', '3-out', '2-out', '1-out']);
  });

  it('calls inner when no middlewares', async () => {
    let called = false;
    const ctx = makeCtx();
    await runMiddlewarePipeline([], ctx, async () => { called = true; });
    expect(called).toBe(true);
  });

  it('passes context by reference – mutations visible downstream', async () => {
    const ctx = makeCtx({ params: { a: 1 } });

    await runMiddlewarePipeline(
      [async (c, next) => { c.params['b'] = 2; await next(); }],
      ctx,
      async () => {},
    );

    expect(ctx.params).toEqual({ a: 1, b: 2 });
  });
});

describe('runMiddlewarePipeline – early returns', () => {
  it('stops pipeline when ctx.result is set before next()', async () => {
    const innerFn = vi.fn();
    const secondMw = vi.fn();
    const ctx = makeCtx();

    await runMiddlewarePipeline(
      [
        async (c, _next) => {
          // Set result without calling next — short-circuit
          c.result = { ok: true, result: 'short-circuited', requestId: undefined };
        },
        async (_c, next) => { secondMw(); await next(); },
      ],
      ctx,
      innerFn,
    );

    expect(innerFn).not.toHaveBeenCalled();
    expect(secondMw).not.toHaveBeenCalled();
    expect(ctx.result?.ok).toBe(true);
  });

  it('stops pipeline when ctx.error is set before next()', async () => {
    const innerFn = vi.fn();
    const ctx = makeCtx();

    await runMiddlewarePipeline(
      [
        async (c, _next) => {
          c.error = { ok: false, requestId: undefined, error: { code: 'AUTH_REQUIRED', message: 'no auth' } };
        },
      ],
      ctx,
      innerFn,
    );

    expect(innerFn).not.toHaveBeenCalled();
    expect(ctx.error?.ok).toBe(false);
  });

  it('stops pipeline mid-chain when result set after next() is called', async () => {
    const log: string[] = [];
    const ctx = makeCtx();

    await runMiddlewarePipeline(
      [
        async (_c, next) => { log.push('mw1-before'); await next(); log.push('mw1-after'); },
        async (c, _next) => {
          log.push('mw2-short-circuit');
          c.result = { ok: true, result: 'early', requestId: undefined };
          // Does not call next
        },
      ],
      ctx,
      async () => { log.push('inner'); },
    );

    // mw2 short-circuited, but mw1-after still runs
    expect(log).toEqual(['mw1-before', 'mw2-short-circuit', 'mw1-after']);
    expect(ctx.result?.ok).toBe(true);
  });
});

describe('runMiddlewarePipeline – error propagation', () => {
  it('propagates thrown errors up the chain', async () => {
    const ctx = makeCtx();

    await expect(
      runMiddlewarePipeline(
        [async (_c, next) => { await next(); }],
        ctx,
        async () => { throw new Error('inner boom'); },
      ),
    ).rejects.toThrow('inner boom');
  });

  it('middleware can catch errors from inner and set ctx.error', async () => {
    const ctx = makeCtx();

    await runMiddlewarePipeline(
      [
        async (c, next) => {
          try {
            await next();
          } catch {
            c.error = { ok: false, requestId: undefined, error: { code: 'INTERNAL_ERROR', message: 'caught' } };
          }
        },
      ],
      ctx,
      async () => { throw new Error('boom'); },
    );

    expect(ctx.error?.ok).toBe(false);
    if (!ctx.error?.ok) {
      expect(ctx.error?.error.code).toBe('INTERNAL_ERROR');
    }
  });

  it('prevents calling next() multiple times', async () => {
    const ctx = makeCtx();

    await expect(
      runMiddlewarePipeline(
        [
          async (_c, next) => {
            await next();
            await next(); // second call — should reject
          },
        ],
        ctx,
        async () => {},
      ),
    ).rejects.toThrow(/next\(\) called multiple times/);
  });
});

// ─── CommandRegistry middleware integration ───────────────────────────────────

describe('CommandRegistry – middleware integration', () => {
  it('middleware can modify params before execution', async () => {
    const registry = new CommandRegistry({
      greet: {
        description: 'Greet',
        params: { name: { type: 'string', required: true } },
        run: async (p) => `Hello, ${p.name}!`,
      },
    });

    registry.setMiddleware([
      async (ctx, next) => {
        ctx.params['name'] = 'World'; // override incoming param
        await next();
      },
    ]);

    const result = await registry.execute('greet', { name: 'ignored' }, {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.result).toBe('Hello, World!');
  });

  it('middleware can inspect result after execution', async () => {
    let capturedResult: unknown;

    const registry = new CommandRegistry({
      ping: { description: 'Ping', run: async () => 'pong' },
    });

    registry.setMiddleware([
      async (ctx, next) => {
        await next();
        if (ctx.result?.ok) capturedResult = ctx.result.result;
      },
    ]);

    await registry.execute('ping', {}, {});
    expect(capturedResult).toBe('pong');
  });

  it('middleware can short-circuit with auth error before command runs', async () => {
    const handlerSpy = vi.fn(async () => 'should not run');

    const registry = new CommandRegistry({
      secret: { description: 'Secret', run: handlerSpy },
    });

    registry.setMiddleware([
      async (ctx, _next) => {
        ctx.error = {
          ok: false,
          requestId: undefined,
          error: { code: 'AUTH_REQUIRED', message: 'Unauthorized' },
        };
        // Don't call next
      },
    ]);

    const result = await registry.execute('secret', {}, {});
    expect(result.ok).toBe(false);
    expect(handlerSpy).not.toHaveBeenCalled();
    if (!result.ok) expect(result.error.code).toBe('AUTH_REQUIRED');
  });

  it('middleware throwing SurfError propagates to error response', async () => {
    const registry = new CommandRegistry({
      test: { description: 'Test', run: async () => 'ok' },
    });

    registry.setMiddleware([
      async (_ctx, _next) => {
        throw new SurfError('RATE_LIMITED', 'Too many requests');
      },
    ]);

    // The pipeline throws — CommandRegistry does not catch middleware throws, only inner throws
    await expect(
      registry.execute('test', {}, {}),
    ).rejects.toThrow(SurfError);
  });

  it('middleware receives the correct command name in ctx', async () => {
    let capturedCommand = '';

    const registry = new CommandRegistry({
      myCommand: { description: 'My command', run: async () => null },
    });

    registry.setMiddleware([
      async (ctx, next) => {
        capturedCommand = ctx.command;
        await next();
      },
    ]);

    await registry.execute('myCommand', {}, {});
    expect(capturedCommand).toBe('myCommand');
  });

  it('replaces old middlewares when setMiddleware called again', async () => {
    const log: string[] = [];

    const registry = new CommandRegistry({
      test: { description: 'Test', run: async () => 'done' },
    });

    registry.setMiddleware([async (_c, next) => { log.push('first'); await next(); }]);
    registry.setMiddleware([async (_c, next) => { log.push('second'); await next(); }]);

    await registry.execute('test', {}, {});
    expect(log).toEqual(['second']); // first is gone
  });
});
