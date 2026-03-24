import { describe, it, expect } from 'vitest';
import { convertZodType, zodToSurfParams } from '../convert.js';

// ---------------------------------------------------------------------------
// Helpers — build mock Zod types for both Zod 3 and Zod 4 styles
// ---------------------------------------------------------------------------

/** Create a mock Zod type with Zod 3's `_def.typeName` convention. */
function zod3(typeName: string, extra: Record<string, unknown> = {}): unknown {
  return { _def: { typeName, ...extra } };
}

/** Create a mock Zod type with Zod 4's `_def.type` convention (lowercase). */
function zod4(type: string, extra: Record<string, unknown> = {}): unknown {
  return { _def: { type, ...extra } };
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

describe('convertZodType — primitives', () => {
  it.each([
    ['ZodString', 'string'],
    ['ZodNumber', 'number'],
    ['ZodBoolean', 'boolean'],
  ] as const)('Zod 3 %s → { type: "%s" }', (typeName, expectedType) => {
    expect(convertZodType(zod3(typeName))).toEqual({ type: expectedType });
  });

  it.each([
    ['string', 'string'],
    ['number', 'number'],
    ['boolean', 'boolean'],
  ] as const)('Zod 4 _def.type=%s → { type: "%s" }', (type, expectedType) => {
    expect(convertZodType(zod4(type))).toEqual({ type: expectedType });
  });
});

// ---------------------------------------------------------------------------
// Enum
// ---------------------------------------------------------------------------

describe('convertZodType — enum', () => {
  it('Zod 3 ZodEnum', () => {
    expect(convertZodType(zod3('ZodEnum', { values: ['a', 'b'] }))).toEqual({
      type: 'string',
      enum: ['a', 'b'],
    });
  });

  it('Zod 4 enum', () => {
    expect(convertZodType(zod4('enum', { values: ['x', 'y'] }))).toEqual({
      type: 'string',
      enum: ['x', 'y'],
    });
  });
});

// ---------------------------------------------------------------------------
// Literal
// ---------------------------------------------------------------------------

describe('convertZodType — literal', () => {
  it('Zod 3 ZodLiteral string', () => {
    expect(convertZodType(zod3('ZodLiteral', { value: 'hello' }))).toEqual({
      type: 'string',
      enum: ['hello'],
    });
  });

  it('Zod 4 literal number', () => {
    expect(convertZodType(zod4('literal', { value: 42 }))).toEqual({
      type: 'number',
    });
  });

  it('Zod 3 ZodLiteral boolean', () => {
    expect(convertZodType(zod3('ZodLiteral', { value: true }))).toEqual({
      type: 'boolean',
    });
  });
});

// ---------------------------------------------------------------------------
// Object
// ---------------------------------------------------------------------------

describe('convertZodType — object', () => {
  it('Zod 3 ZodObject with shape as function', () => {
    const schema = zod3('ZodObject', {
      shape: () => ({
        name: zod3('ZodString'),
        age: zod3('ZodNumber'),
      }),
    });

    expect(convertZodType(schema)).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string', required: true },
        age: { type: 'number', required: true },
      },
    });
  });

  it('Zod 4 object with shape as plain object', () => {
    const schema = zod4('object', {
      shape: {
        active: zod4('boolean'),
        label: zod4('string'),
      },
    });

    expect(convertZodType(schema)).toEqual({
      type: 'object',
      properties: {
        active: { type: 'boolean', required: true },
        label: { type: 'string', required: true },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// Array
// ---------------------------------------------------------------------------

describe('convertZodType — array', () => {
  it('Zod 3 ZodArray', () => {
    const schema = zod3('ZodArray', { type: zod3('ZodString') });
    expect(convertZodType(schema)).toEqual({
      type: 'array',
      items: { type: 'string' },
    });
  });

  it('Zod 4 array', () => {
    const schema = zod4('array', { element: zod4('number') });
    expect(convertZodType(schema)).toEqual({
      type: 'array',
      items: { type: 'number' },
    });
  });
});

// ---------------------------------------------------------------------------
// Optional
// ---------------------------------------------------------------------------

describe('convertZodType — optional', () => {
  it('Zod 3 ZodOptional', () => {
    const schema = zod3('ZodOptional', { innerType: zod3('ZodString') });
    expect(convertZodType(schema)).toEqual({
      type: 'string',
      required: false,
    });
  });

  it('Zod 4 optional', () => {
    const schema = zod4('optional', { innerType: zod4('number') });
    expect(convertZodType(schema)).toEqual({
      type: 'number',
      required: false,
    });
  });
});

// ---------------------------------------------------------------------------
// Default
// ---------------------------------------------------------------------------

describe('convertZodType — default', () => {
  it('Zod 3 ZodDefault', () => {
    const schema = zod3('ZodDefault', {
      innerType: zod3('ZodNumber'),
      defaultValue: () => 42,
    });
    expect(convertZodType(schema)).toEqual({
      type: 'number',
      default: 42,
    });
  });

  it('Zod 4 default', () => {
    const schema = zod4('default', {
      innerType: zod4('string'),
      defaultValue: () => 'hello',
    });
    expect(convertZodType(schema)).toEqual({
      type: 'string',
      default: 'hello',
    });
  });
});

// ---------------------------------------------------------------------------
// Nullable
// ---------------------------------------------------------------------------

describe('convertZodType — nullable', () => {
  it('Zod 3 ZodNullable', () => {
    const schema = zod3('ZodNullable', { innerType: zod3('ZodBoolean') });
    expect(convertZodType(schema)).toEqual({
      type: 'boolean',
      required: false,
    });
  });

  it('Zod 4 nullable', () => {
    const schema = zod4('nullable', { innerType: zod4('string') });
    expect(convertZodType(schema)).toEqual({
      type: 'string',
      required: false,
    });
  });
});

// ---------------------------------------------------------------------------
// Effects / Refinements
// ---------------------------------------------------------------------------

describe('convertZodType — effects', () => {
  it('Zod 3 ZodEffects unwraps to inner schema', () => {
    const schema = zod3('ZodEffects', { schema: zod3('ZodString') });
    expect(convertZodType(schema)).toEqual({ type: 'string' });
  });

  it('Zod 4 effects unwraps to inner schema', () => {
    const schema = zod4('effects', { schema: zod4('number') });
    expect(convertZodType(schema)).toEqual({ type: 'number' });
  });
});

// ---------------------------------------------------------------------------
// Description passthrough
// ---------------------------------------------------------------------------

describe('convertZodType — description', () => {
  it('attaches description from Zod 3 type', () => {
    const schema = { description: 'A name', _def: { typeName: 'ZodString' } };
    expect(convertZodType(schema)).toEqual({
      type: 'string',
      description: 'A name',
    });
  });

  it('attaches description from Zod 4 type', () => {
    const schema = { description: 'Count', _def: { type: 'number' } };
    expect(convertZodType(schema)).toEqual({
      type: 'number',
      description: 'Count',
    });
  });
});

// ---------------------------------------------------------------------------
// zodToSurfParams (top-level converter)
// ---------------------------------------------------------------------------

describe('zodToSurfParams', () => {
  it('converts Zod 3 object schema', () => {
    const schema = zod3('ZodObject', {
      shape: () => ({
        query: zod3('ZodString'),
        limit: zod3('ZodOptional', { innerType: zod3('ZodNumber') }),
      }),
    });

    expect(zodToSurfParams(schema)).toEqual({
      query: { type: 'string', required: true },
      limit: { type: 'number', required: false },
    });
  });

  it('converts Zod 4 object schema (plain shape)', () => {
    const schema = zod4('object', {
      shape: {
        name: zod4('string'),
        active: zod4('default', {
          innerType: zod4('boolean'),
          defaultValue: () => true,
        }),
      },
    });

    expect(zodToSurfParams(schema)).toEqual({
      name: { type: 'string', required: true },
      active: { type: 'boolean', default: true, required: true },
    });
  });
});
