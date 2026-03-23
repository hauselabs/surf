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
 * Uses loose typing to support both Zod 3 and Zod 4.
 */
export interface ZodCommandConfig<
  S extends Record<string, unknown> = Record<string, unknown>,
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
  /** The command handler — receives params (use Zod's infer for typing in your code). */
  run: (params: Record<string, unknown>, ctx: ExecutionContext) => R | Promise<R>;
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
  S extends Record<string, unknown> = Record<string, unknown>,
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
