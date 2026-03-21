import type { ZodObject, ZodTypeAny, infer as ZodInfer } from 'zod';
import type {
  CommandDefinition,
  CommandHints,
  CommandExample,
  ExecutionContext,
  PaginationConfig,
  ParamSchema,
  RateLimitConfig,
  TypeRef,
} from '@surfjs/core';
import { zodToSurfParams } from './convert.js';

export { zodToSurfParams, convertZodType } from './convert.js';
export { zodValidator } from './validate.js';

/**
 * Configuration for defining a Surf command using a Zod schema.
 * The `params` field accepts a `z.object({...})` instead of raw `ParamSchema`.
 */
export interface ZodCommandConfig<
  S extends ZodObject<Record<string, ZodTypeAny>>,
  R = unknown,
> {
  /** Human-readable description of what this command does (shown to agents). */
  description: string;
  /** Zod object schema defining the command's parameters. */
  params: S;
  /** Return type schema for manifest documentation. */
  returns?: ParamSchema | TypeRef;
  /** Tags for grouping/filtering commands. */
  tags?: string[];
  /** Authentication requirement for this command. */
  auth?: 'none' | 'required' | 'optional' | 'hidden';
  /** Behavioral hints for agent optimization. */
  hints?: CommandHints;
  /** Enable SSE streaming for this command. */
  stream?: boolean;
  /** Per-command rate limiting. */
  rateLimit?: RateLimitConfig;
  /** Example request/response pairs shown in manifest. */
  examples?: CommandExample[];
  /** Enable pagination for this command. */
  paginated?: boolean | PaginationConfig;
  /** The command handler — receives fully-typed params inferred from the Zod schema. */
  run: (params: ZodInfer<S>, ctx: ExecutionContext) => R | Promise<R>;
}

/**
 * Define a Surf command using a Zod schema for parameters.
 *
 * Converts the Zod schema to Surf's native `ParamSchema` format at runtime,
 * while providing full TypeScript inference from the Zod schema for the handler.
 *
 * @example
 * ```ts
 * import { z } from 'zod';
 * import { defineZodCommand } from '@surfjs/zod';
 *
 * const search = defineZodCommand({
 *   description: 'Search products',
 *   params: z.object({
 *     query: z.string().describe('Search query'),
 *     limit: z.number().int().min(1).max(100).optional().default(20),
 *     category: z.enum(['electronics', 'clothing', 'books']).optional(),
 *   }),
 *   run: async ({ query, limit, category }) => {
 *     // params are fully typed!
 *     return { results: [] };
 *   },
 * });
 * ```
 */
export function defineZodCommand<
  S extends ZodObject<Record<string, ZodTypeAny>>,
  R = unknown,
>(config: ZodCommandConfig<S, R>): CommandDefinition {
  const { params: zodSchema, run, ...rest } = config;
  const surfParams = zodToSurfParams(zodSchema);

  return {
    ...rest,
    params: surfParams,
    run: run as CommandDefinition['run'],
  };
}
