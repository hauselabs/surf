/**
 * Schema-to-TypeScript inference utilities.
 *
 * These conditional types map `ParamSchema` definitions to their TypeScript
 * equivalents at compile time. The runtime cost is zero — all inference
 * happens in the type system.
 *
 * @module
 */

import type {
  ParamSchema,
  TypeRef,
  CommandDefinition,
  CommandHints,
  CommandExample,
  ExecutionContext,
  RateLimitConfig,
  PaginationConfig,
} from './types.js';

// ─── Core Inference Types ────────────────────────────────────────────────────

/**
 * Infers the TypeScript type for a single `ParamSchema`.
 *
 * - `'string'` → `string` (or literal union when `enum` is present)
 * - `'number'` → `number`
 * - `'boolean'` → `boolean`
 * - `'object'` → recursively inferred object shape
 * - `'array'` → `InferParam<items>[]`
 * - Falls back to `unknown` for unrecognized schemas or `$ref` items
 */
export type InferParam<S extends ParamSchema> =
  S['type'] extends 'string'
    ? S extends { enum: readonly (infer E)[] }
      ? E extends string ? E : string
      : string
    : S['type'] extends 'number'
      ? number
      : S['type'] extends 'boolean'
        ? boolean
        : S['type'] extends 'object'
          ? InferObject<S>
          : S['type'] extends 'array'
            ? InferArray<S>
            : unknown;

/**
 * Infers an object shape from a `ParamSchema` with `properties`.
 * Falls back to `Record<string, unknown>` when no properties are declared.
 */
type InferObject<S extends ParamSchema> =
  S extends { properties: infer P extends Record<string, ParamSchema> }
    ? InferParams<P>
    : Record<string, unknown>;

/**
 * Infers an array element type from a `ParamSchema` with `items`.
 * Falls back to `unknown[]` when no items schema is declared.
 * `$ref` items resolve to `unknown` (no cross-schema resolution at type level).
 */
type InferArray<S extends ParamSchema> =
  S extends { items: infer I }
    ? I extends ParamSchema
      ? InferParam<I>[]
      : I extends TypeRef
        ? unknown[]   // $ref — cannot resolve at type level
        : unknown[]
    : unknown[];

// ─── Params Record Inference ─────────────────────────────────────────────────

/**
 * Maps a record of `ParamSchema` entries to a TypeScript object type,
 * splitting required keys from optional ones.
 *
 * Keys with `required: true` are non-optional; all others are optional (`?`).
 *
 * @example
 * ```ts
 * type P = InferParams<{
 *   name:  { type: 'string'; required: true };
 *   count: { type: 'number' };
 * }>;
 * // → { name: string } & { count?: number }
 * ```
 */
export type InferParams<P extends Record<string, ParamSchema>> =
  Prettify<
    { [K in RequiredKeys<P>]: InferParam<P[K]> } &
    { [K in OptionalKeys<P>]?: InferParam<P[K]> }
  >;

/** Extract keys where `required` is literally `true`. */
type RequiredKeys<P extends Record<string, ParamSchema>> = {
  [K in keyof P]: P[K]['required'] extends true ? K : never;
}[keyof P];

/** Extract keys where `required` is not literally `true`. */
type OptionalKeys<P extends Record<string, ParamSchema>> = {
  [K in keyof P]: P[K]['required'] extends true ? never : K;
}[keyof P];

/** Flattens intersection types into a single object for cleaner IntelliSense. */
type Prettify<T> = { [K in keyof T]: T[K] } & {};

// ─── defineCommand ───────────────────────────────────────────────────────────

/**
 * Input shape for `defineCommand`. Mirrors `CommandDefinition` but uses
 * generic `P` so the `run` handler can receive inferred param types.
 */
interface DefineCommandInput<
  P extends Record<string, ParamSchema>,
  R,
> {
  description: string;
  params?: P;
  returns?: ParamSchema | TypeRef;
  tags?: string[];
  auth?: 'none' | 'required' | 'optional' | 'hidden';
  hints?: CommandHints;
  stream?: boolean;
  rateLimit?: RateLimitConfig;
  examples?: CommandExample[];
  paginated?: boolean | PaginationConfig;
  run: (params: InferParams<P>, ctx: ExecutionContext) => R | Promise<R>;
}

/**
 * Define a command with fully inferred handler param types.
 *
 * At runtime this is an identity function — it returns its argument unchanged.
 * All value is in the type inference: the `run` handler's `params` argument
 * is automatically typed based on the `params` schema you declare.
 *
 * @example
 * ```ts
 * const getUser = defineCommand({
 *   description: 'Get a user by ID',
 *   params: {
 *     id:     { type: 'string', required: true, description: 'User ID' },
 *     expand: { type: 'boolean', description: 'Include related data' },
 *   },
 *   run(params, ctx) {
 *     // params.id   → string  (required)
 *     // params.expand → boolean | undefined (optional)
 *     return db.users.find(params.id);
 *   },
 * });
 * ```
 */
export function defineCommand<
  P extends Record<string, ParamSchema>,
  R = unknown,
>(def: DefineCommandInput<P, R>): CommandDefinition {
  // Identity at runtime — the cast is safe because DefineCommandInput
  // is a strict superset of CommandDefinition's shape.
  return def as unknown as CommandDefinition;
}
