import type { ExecutionContext, SurfResponse } from './types.js';

/**
 * Context object passed through the middleware pipeline.
 *
 * Middleware can read and modify `params` and `context`, or short-circuit
 * execution by setting `result` or `error` (which stops the pipeline).
 */
export interface MiddlewareContext {
  readonly command: string;
  params: Record<string, unknown>;
  context: ExecutionContext;
  result?: SurfResponse;
  error?: SurfResponse;
}

/**
 * A middleware function that intercepts command execution.
 *
 * Call `next()` to continue to the next middleware (or the command handler).
 * Set `ctx.result` or `ctx.error` to short-circuit the pipeline.
 *
 * @example
 * ```ts
 * const logger: SurfMiddleware = async (ctx, next) => {
 *   const start = Date.now();
 *   await next();
 *   console.log(`${ctx.command} took ${Date.now() - start}ms`);
 * };
 * ```
 */
export type SurfMiddleware = (
  ctx: MiddlewareContext,
  next: () => Promise<void>,
) => Promise<void>;

/**
 * Compose middlewares into a pipeline and run them around an inner function.
 *
 * Middleware execute in order. Each can call `next()` to proceed to the next
 * middleware. The `innerFn` runs after all middleware have called `next()`.
 * If `ctx.result` or `ctx.error` is set at any point, remaining middleware are skipped.
 *
 * @param middlewares - Array of middleware functions to execute in order.
 * @param ctx - The shared context object for this execution.
 * @param innerFn - The core function (command handler) to run after all middleware.
 * @throws Error if `next()` is called more than once in a single middleware.
 */
export function runMiddlewarePipeline(
  middlewares: readonly SurfMiddleware[],
  ctx: MiddlewareContext,
  innerFn: () => Promise<void>,
): Promise<void> {
  let index = -1;

  function dispatch(i: number): Promise<void> {
    if (i <= index) {
      return Promise.reject(new Error('next() called multiple times'));
    }
    index = i;

    if (ctx.result || ctx.error) {
      return Promise.resolve();
    }

    if (i >= middlewares.length) {
      return innerFn();
    }

    const middleware = middlewares[i]!;
    return middleware(ctx, () => dispatch(i + 1));
  }

  return dispatch(0);
}
