import type { ZodObject, ZodTypeAny } from 'zod';
import type { MiddlewareContext, SurfMiddleware } from '@surfjs/core';

/**
 * Create a Surf middleware that validates command params against a Zod schema.
 * Use this for runtime validation in addition to (or instead of) Surf's built-in validation.
 *
 * @param schema - A `z.object({...})` schema to validate incoming params against
 * @returns A SurfMiddleware function
 *
 * @example
 * ```ts
 * import { z } from 'zod';
 * import { zodValidator } from '@surfjs/zod';
 *
 * const schema = z.object({
 *   query: z.string().min(1),
 *   limit: z.number().int().min(1).max(100).optional(),
 * });
 *
 * // Use as middleware in a Surf config
 * middleware: [zodValidator(schema)]
 * ```
 */
export function zodValidator(
  schema: ZodObject<Record<string, ZodTypeAny>>,
): SurfMiddleware {
  return async (ctx: MiddlewareContext, next: () => Promise<void>) => {
    const parseResult = schema.safeParse(ctx.params);

    if (!parseResult.success) {
      const issues = parseResult.error.issues;
      const message = issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');

      ctx.error = {
        ok: false,
        error: {
          code: 'INVALID_PARAMS',
          message: `Zod validation failed: ${message}`,
          details: {
            issues: issues.map((issue) => ({
              path: issue.path,
              message: issue.message,
              code: issue.code,
            })),
          },
        },
      };
      return;
    }

    // Replace params with parsed (and potentially transformed/defaulted) values
    ctx.params = parseResult.data as Record<string, unknown>;
    await next();
  };
}
