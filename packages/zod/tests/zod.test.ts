import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { zodToSurfParams, convertZodType, zodValidator, defineZodCommand } from '../src/index.js';
import type { ParamSchema } from '@surfjs/core';
import type { MiddlewareContext } from '@surfjs/core';

// ─── convertZodType ─────────────────────────────────────────────────────────

describe('convertZodType', () => {
  describe('primitives', () => {
    it('converts z.string() to string type', () => {
      const result = convertZodType(z.string());
      expect(result).toEqual({ type: 'string' });
    });

    it('converts z.number() to number type', () => {
      const result = convertZodType(z.number());
      expect(result).toEqual({ type: 'number' });
    });

    it('converts z.boolean() to boolean type', () => {
      const result = convertZodType(z.boolean());
      expect(result).toEqual({ type: 'boolean' });
    });
  });

  describe('descriptions', () => {
    it('preserves .describe() on string', () => {
      const result = convertZodType(z.string().describe('A name'));
      expect(result).toEqual({ type: 'string', description: 'A name' });
    });

    it('preserves .describe() on number', () => {
      const result = convertZodType(z.number().describe('Count'));
      expect(result).toEqual({ type: 'number', description: 'Count' });
    });
  });

  describe('optional and nullable', () => {
    it('converts z.string().optional() with required=false', () => {
      const result = convertZodType(z.string().optional());
      expect(result).toEqual({ type: 'string', required: false });
    });

    it('converts z.number().nullable() with required=false', () => {
      const result = convertZodType(z.number().nullable());
      expect(result).toEqual({ type: 'number', required: false });
    });

    it('converts optional + described', () => {
      const result = convertZodType(z.string().describe('Name').optional());
      expect(result.type).toBe('string');
      expect(result.required).toBe(false);
      expect(result.description).toBe('Name');
    });
  });

  describe('defaults', () => {
    it('converts z.number().default(10) with default value', () => {
      const result = convertZodType(z.number().default(10));
      expect(result.type).toBe('number');
      expect(result.default).toBe(10);
    });

    it('converts z.string().default("hello")', () => {
      const result = convertZodType(z.string().default('hello'));
      expect(result.type).toBe('string');
      expect(result.default).toBe('hello');
    });

    it('converts z.boolean().default(false)', () => {
      const result = convertZodType(z.boolean().default(false));
      expect(result.type).toBe('boolean');
      expect(result.default).toBe(false);
    });
  });

  describe('enums', () => {
    it('converts z.enum() to string with enum values', () => {
      const result = convertZodType(z.enum(['a', 'b', 'c']));
      expect(result).toEqual({ type: 'string', enum: ['a', 'b', 'c'] });
    });

    it('converts z.enum() with description', () => {
      const result = convertZodType(z.enum(['red', 'green']).describe('Color'));
      expect(result.type).toBe('string');
      expect(result.enum).toEqual(['red', 'green']);
      expect(result.description).toBe('Color');
    });
  });

  describe('literals', () => {
    it('converts z.literal("hello") to string with enum', () => {
      const result = convertZodType(z.literal('hello'));
      expect(result).toEqual({ type: 'string', enum: ['hello'] });
    });

    it('converts z.literal(42) to number', () => {
      const result = convertZodType(z.literal(42));
      expect(result).toEqual({ type: 'number' });
    });

    it('converts z.literal(true) to boolean', () => {
      const result = convertZodType(z.literal(true));
      expect(result).toEqual({ type: 'boolean' });
    });
  });

  describe('arrays', () => {
    it('converts z.array(z.string()) to array of strings', () => {
      const result = convertZodType(z.array(z.string()));
      expect(result).toEqual({ type: 'array', items: { type: 'string' } });
    });

    it('converts z.array(z.number()) to array of numbers', () => {
      const result = convertZodType(z.array(z.number()));
      expect(result).toEqual({ type: 'array', items: { type: 'number' } });
    });

    it('converts nested array of objects', () => {
      const result = convertZodType(
        z.array(z.object({ name: z.string() })),
      );
      expect(result.type).toBe('array');
      const items = result.items as ParamSchema;
      expect(items.type).toBe('object');
      expect(items.properties?.name).toEqual({ type: 'string', required: true });
    });
  });

  describe('objects', () => {
    it('converts z.object() to object with properties', () => {
      const result = convertZodType(
        z.object({
          name: z.string(),
          age: z.number(),
        }),
      );
      expect(result.type).toBe('object');
      expect(result.properties).toEqual({
        name: { type: 'string', required: true },
        age: { type: 'number', required: true },
      });
    });

    it('converts nested objects', () => {
      const result = convertZodType(
        z.object({
          address: z.object({
            street: z.string(),
            city: z.string(),
          }),
        }),
      );
      expect(result.type).toBe('object');
      const address = result.properties?.address as ParamSchema;
      expect(address.type).toBe('object');
      expect(address.properties?.street).toEqual({ type: 'string', required: true });
      expect(address.properties?.city).toEqual({ type: 'string', required: true });
    });

    it('handles mixed required and optional fields in objects', () => {
      const result = convertZodType(
        z.object({
          required: z.string(),
          optional: z.string().optional(),
        }),
      );
      expect(result.properties?.required).toEqual({ type: 'string', required: true });
      expect(result.properties?.optional).toEqual({ type: 'string', required: false });
    });
  });

  describe('unions', () => {
    it('converts z.union() using first variant', () => {
      const result = convertZodType(z.union([z.string(), z.number()]));
      expect(result.type).toBe('string');
    });
  });

  describe('effects (refinements)', () => {
    it('converts refined types by unwrapping', () => {
      const result = convertZodType(z.string().min(1).max(100));
      expect(result.type).toBe('string');
    });

    it('converts z.string().transform() by unwrapping', () => {
      const result = convertZodType(z.string().transform((s) => s.toUpperCase()));
      expect(result.type).toBe('string');
    });
  });

  describe('fallback', () => {
    it('returns string type for unknown/unsupported zod types', () => {
      // z.any() doesn't have a recognized typeName mapping
      const result = convertZodType(z.any());
      expect(result.type).toBe('string');
    });
  });
});

// ─── zodToSurfParams ────────────────────────────────────────────────────────

describe('zodToSurfParams', () => {
  it('converts a basic schema to param record', () => {
    const schema = z.object({
      query: z.string().describe('Search query'),
      limit: z.number().optional(),
    });
    const result = zodToSurfParams(schema);
    expect(result.query).toEqual({
      type: 'string',
      required: true,
      description: 'Search query',
    });
    expect(result.limit).toEqual({
      type: 'number',
      required: false,
    });
  });

  it('sets required=true by default for all fields', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });
    const result = zodToSurfParams(schema);
    expect(result.name?.required).toBe(true);
    expect(result.age?.required).toBe(true);
  });

  it('handles complex schemas with defaults, enums, and descriptions', () => {
    const schema = z.object({
      query: z.string().describe('Search term'),
      limit: z.number().default(20).describe('Max results'),
      category: z.enum(['electronics', 'clothing', 'books']).optional(),
      active: z.boolean().default(true),
    });
    const result = zodToSurfParams(schema);

    expect(result.query).toEqual({
      type: 'string',
      required: true,
      description: 'Search term',
    });
    expect(result.limit?.type).toBe('number');
    expect(result.limit?.default).toBe(20);
    expect(result.limit?.description).toBe('Max results');
    expect(result.category?.type).toBe('string');
    expect(result.category?.enum).toEqual(['electronics', 'clothing', 'books']);
    expect(result.category?.required).toBe(false);
    expect(result.active?.type).toBe('boolean');
    expect(result.active?.default).toBe(true);
  });

  it('handles empty object schema', () => {
    const schema = z.object({});
    const result = zodToSurfParams(schema);
    expect(result).toEqual({});
  });

  it('handles deeply nested schemas', () => {
    const schema = z.object({
      config: z.object({
        database: z.object({
          host: z.string(),
          port: z.number().default(5432),
        }),
      }),
    });
    const result = zodToSurfParams(schema);
    const config = result.config as ParamSchema;
    expect(config.type).toBe('object');
    const database = config.properties?.database as ParamSchema;
    expect(database.type).toBe('object');
    expect(database.properties?.host).toEqual({ type: 'string', required: true });
    expect(database.properties?.port?.type).toBe('number');
    expect(database.properties?.port?.default).toBe(5432);
  });
});

// ─── zodValidator middleware ────────────────────────────────────────────────

describe('zodValidator', () => {
  function makeCtx(params: Record<string, unknown>): MiddlewareContext {
    return {
      command: 'test-command',
      params,
      context: {} as MiddlewareContext['context'],
    };
  }

  it('passes valid params and calls next()', async () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });
    const middleware = zodValidator(schema);
    const ctx = makeCtx({ name: 'Alice', age: 30 });
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(ctx, next);

    expect(next).toHaveBeenCalledOnce();
    expect(ctx.error).toBeUndefined();
    expect(ctx.params).toEqual({ name: 'Alice', age: 30 });
  });

  it('rejects invalid params with INVALID_PARAMS error', async () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });
    const middleware = zodValidator(schema);
    const ctx = makeCtx({ name: 123, age: 'not a number' });
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(ctx, next);

    expect(next).not.toHaveBeenCalled();
    expect(ctx.error).toBeDefined();
    const error = ctx.error as { ok: boolean; error: { code: string; message: string; details: { issues: Array<{ path: Array<string | number>; message: string; code: string }> } } };
    expect(error.ok).toBe(false);
    expect(error.error.code).toBe('INVALID_PARAMS');
    expect(error.error.message).toContain('Zod validation failed');
  });

  it('includes issue details in error response', async () => {
    const schema = z.object({
      email: z.string().email(),
    });
    const middleware = zodValidator(schema);
    const ctx = makeCtx({ email: 'not-an-email' });
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(ctx, next);

    expect(ctx.error).toBeDefined();
    const error = ctx.error as { error: { details: { issues: Array<{ path: Array<string | number>; message: string; code: string }> } } };
    expect(error.error.details.issues).toBeInstanceOf(Array);
    expect(error.error.details.issues.length).toBeGreaterThan(0);
    expect(error.error.details.issues[0]?.path).toEqual(['email']);
  });

  it('replaces params with parsed values (defaults applied)', async () => {
    const schema = z.object({
      name: z.string(),
      limit: z.number().default(10),
    });
    const middleware = zodValidator(schema);
    const ctx = makeCtx({ name: 'Bob' });
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(ctx, next);

    expect(next).toHaveBeenCalledOnce();
    expect(ctx.params).toEqual({ name: 'Bob', limit: 10 });
  });

  it('handles missing required fields', async () => {
    const schema = z.object({
      required_field: z.string(),
    });
    const middleware = zodValidator(schema);
    const ctx = makeCtx({});
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(ctx, next);

    expect(next).not.toHaveBeenCalled();
    expect(ctx.error).toBeDefined();
    const error = ctx.error as { error: { message: string } };
    expect(error.error.message).toContain('Zod validation failed');
  });

  it('validates nested objects', async () => {
    const schema = z.object({
      user: z.object({
        name: z.string(),
        age: z.number().min(0),
      }),
    });
    const middleware = zodValidator(schema);
    const ctx = makeCtx({ user: { name: 'Alice', age: -1 } });
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(ctx, next);

    expect(next).not.toHaveBeenCalled();
    expect(ctx.error).toBeDefined();
  });

  it('formats multiple error paths correctly', async () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
      email: z.string().email(),
    });
    const middleware = zodValidator(schema);
    const ctx = makeCtx({ name: 123, age: 'bad', email: 'invalid' });
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(ctx, next);

    const error = ctx.error as { error: { message: string; details: { issues: Array<{ path: Array<string | number> }> } } };
    expect(error.error.details.issues.length).toBeGreaterThanOrEqual(3);
    expect(error.error.message).toContain(';'); // multiple issues joined by semicolons
  });
});

// ─── defineZodCommand ───────────────────────────────────────────────────────

describe('defineZodCommand', () => {
  it('returns a CommandDefinition with converted params', () => {
    const cmd = defineZodCommand({
      description: 'Test command',
      params: z.object({
        query: z.string().describe('Search query'),
        limit: z.number().optional().default(20),
      }),
      run: async (params) => ({ results: [] }),
    });

    expect(cmd.description).toBe('Test command');
    expect(cmd.params).toBeDefined();
    const params = cmd.params as Record<string, ParamSchema>;
    expect(params.query?.type).toBe('string');
    expect(params.query?.description).toBe('Search query');
    expect(params.limit?.type).toBe('number');
    expect(params.limit?.default).toBe(20);
  });

  it('preserves run handler', async () => {
    const runFn = vi.fn().mockResolvedValue({ ok: true });
    const cmd = defineZodCommand({
      description: 'Test',
      params: z.object({ id: z.string() }),
      run: runFn,
    });

    await cmd.run({ id: '123' }, {} as Parameters<typeof cmd.run>[1]);
    expect(runFn).toHaveBeenCalledWith({ id: '123' }, expect.anything());
  });

  it('preserves optional config fields', () => {
    const cmd = defineZodCommand({
      description: 'Tagged command',
      params: z.object({}),
      tags: ['admin', 'internal'],
      auth: 'required',
      stream: true,
      run: async () => null,
    });

    expect(cmd.tags).toEqual(['admin', 'internal']);
    expect(cmd.auth).toBe('required');
    expect(cmd.stream).toBe(true);
  });

  it('handles complex params with enums, arrays, and nested objects', () => {
    const cmd = defineZodCommand({
      description: 'Complex command',
      params: z.object({
        categories: z.array(z.enum(['a', 'b', 'c'])),
        config: z.object({
          verbose: z.boolean().default(false),
          tags: z.array(z.string()).optional(),
        }),
      }),
      run: async () => ({}),
    });

    const params = cmd.params as Record<string, ParamSchema>;
    expect(params.categories?.type).toBe('array');
    const catItems = params.categories?.items as ParamSchema;
    expect(catItems.type).toBe('string');
    expect(catItems.enum).toEqual(['a', 'b', 'c']);

    expect(params.config?.type).toBe('object');
    const configProps = params.config?.properties;
    expect(configProps?.verbose?.type).toBe('boolean');
    expect(configProps?.verbose?.default).toBe(false);
    expect(configProps?.tags?.type).toBe('array');
    expect(configProps?.tags?.required).toBe(false);
  });

  it('does not include zod schema in the output', () => {
    const cmd = defineZodCommand({
      description: 'No schema leak',
      params: z.object({ x: z.string() }),
      run: async () => null,
    });

    // The params should be a plain object, not a Zod schema
    expect((cmd.params as Record<string, unknown>)['_def']).toBeUndefined();
  });
});
