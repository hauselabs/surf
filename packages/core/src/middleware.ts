import type { ExecutionContext, SurfResponse } from './types.js';

/**
 * Context object passed through the middleware pipeline.
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
 */
export type SurfMiddleware = (
  ctx: MiddlewareContext,
  next: () => Promise<void>,
) => Promise<void>;

/**
 * Compose middlewares into a pipeline and run them around an inner function.
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
