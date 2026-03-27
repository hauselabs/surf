import { describe, it, expect } from 'vitest';
import { validateParams, validateResult } from '../src/validation.js';
import { SurfError } from '../src/errors.js';

// ─── validateParams ──────────────────────────────────────────────────────────

describe('validateParams – basic types', () => {
  it('returns empty object when schema is empty', () => {
    expect(validateParams({}, {})).toEqual({});
    expect(validateParams(undefined, {})).toEqual({});
  });

  it('passes valid string param', () => {
    const result = validateParams({ name: 'Alice' }, { name: { type: 'string', required: true } });
    expect(result).toEqual({ name: 'Alice' });
  });

  it('passes valid number param', () => {
    const result = validateParams({ count: 42 }, { count: { type: 'number', required: true } });
    expect(result).toEqual({ count: 42 });
  });

  it('passes valid boolean param', () => {
    const result = validateParams({ active: true }, { active: { type: 'boolean', required: true } });
    expect(result).toEqual({ active: true });
  });

  it('rejects wrong type – string for number', () => {
    expect(() =>
      validateParams({ count: 'five' }, { count: { type: 'number', required: true } }),
    ).toThrow(SurfError);
    expect(() =>
      validateParams({ count: 'five' }, { count: { type: 'number', required: true } }),
    ).toThrow(/number/);
  });

  it('rejects wrong type – number for boolean', () => {
    expect(() =>
      validateParams({ flag: 1 }, { flag: { type: 'boolean', required: true } }),
    ).toThrow(SurfError);
  });

  it('includes parameter name in error message', () => {
    try {
      validateParams({ myParam: 123 }, { myParam: { type: 'string', required: true } });
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SurfError);
      expect((e as SurfError).message).toContain('myParam');
    }
  });

  it('error details contains errors array', () => {
    try {
      validateParams({}, { a: { type: 'string', required: true } });
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SurfError);
      expect((e as SurfError).code).toBe('INVALID_PARAMS');
      expect((e as SurfError).details).toHaveProperty('errors');
      expect(Array.isArray((e as SurfError).details?.['errors'])).toBe(true);
    }
  });
});

describe('validateParams – optional and default values', () => {
  it('omits optional params that are not provided', () => {
    const result = validateParams({}, { tag: { type: 'string' } });
    expect(result).not.toHaveProperty('tag');
  });

  it('omits optional param when value is null', () => {
    const result = validateParams({ tag: null }, { tag: { type: 'string' } });
    expect(result).not.toHaveProperty('tag');
  });

  it('applies default when param is missing', () => {
    const result = validateParams({}, { limit: { type: 'number', default: 20 } });
    expect(result).toEqual({ limit: 20 });
  });

  it('applies default of 0 (falsy but valid)', () => {
    const result = validateParams({}, { offset: { type: 'number', default: 0 } });
    expect(result).toEqual({ offset: 0 });
  });

  it('applies default of false (falsy but valid)', () => {
    const result = validateParams({}, { verbose: { type: 'boolean', default: false } });
    expect(result).toEqual({ verbose: false });
  });

  it('does not apply default when value is provided', () => {
    const result = validateParams({ limit: 5 }, { limit: { type: 'number', default: 20 } });
    expect(result).toEqual({ limit: 5 });
  });

  it('errors on multiple missing required params – lists all', () => {
    try {
      validateParams({}, {
        a: { type: 'string', required: true },
        b: { type: 'number', required: true },
        c: { type: 'boolean', required: true },
      });
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SurfError);
      const errors = (e as SurfError).details?.['errors'] as string[];
      expect(errors).toHaveLength(3);
    }
  });
});

describe('validateParams – enum validation', () => {
  const schema = { color: { type: 'string' as const, required: true, enum: ['red', 'green', 'blue'] as const } };

  it('accepts valid enum value', () => {
    expect(validateParams({ color: 'red' }, schema)).toEqual({ color: 'red' });
    expect(validateParams({ color: 'blue' }, schema)).toEqual({ color: 'blue' });
  });

  it('rejects value not in enum', () => {
    expect(() => validateParams({ color: 'yellow' }, schema)).toThrow(SurfError);
  });

  it('error message lists allowed values', () => {
    try {
      validateParams({ color: 'purple' }, schema);
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as SurfError).message).toContain('red');
      expect((e as SurfError).message).toContain('green');
      expect((e as SurfError).message).toContain('blue');
    }
  });

  it('error message includes the rejected value', () => {
    try {
      validateParams({ color: 'ultraviolet' }, schema);
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as SurfError).message).toContain('ultraviolet');
    }
  });
});

describe('validateParams – nested objects', () => {
  const schema = {
    address: {
      type: 'object' as const,
      required: true,
      properties: {
        street: { type: 'string' as const, required: true },
        city:   { type: 'string' as const, required: true },
        zip:    { type: 'string' as const },
      },
    },
  };

  it('validates a correct nested object', () => {
    const result = validateParams(
      { address: { street: '123 Main St', city: 'Copenhagen', zip: '1000' } },
      schema,
    );
    expect(result['address']).toEqual({ street: '123 Main St', city: 'Copenhagen', zip: '1000' });
  });

  it('validates nested object without optional nested field', () => {
    const result = validateParams(
      { address: { street: '123 Main St', city: 'Copenhagen' } },
      schema,
    );
    expect((result['address'] as Record<string, unknown>)['zip']).toBeUndefined();
  });

  it('rejects nested object with missing required nested field', () => {
    expect(() =>
      validateParams({ address: { street: '123 Main St' } }, schema),
    ).toThrow(SurfError);
  });

  it('error message references nested field path', () => {
    try {
      validateParams({ address: { street: '123 Main St' } }, schema);
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as SurfError).message).toContain('address');
    }
  });

  it('rejects nested object with wrong field type', () => {
    expect(() =>
      validateParams({ address: { street: 123, city: 'Copenhagen' } }, schema),
    ).toThrow(SurfError);
  });

  it('rejects when nested object itself is wrong type (string instead of object)', () => {
    expect(() =>
      validateParams({ address: 'not-an-object' }, schema),
    ).toThrow(SurfError);
  });

  it('deeply nested objects are validated', () => {
    const deepSchema = {
      user: {
        type: 'object' as const,
        required: true,
        properties: {
          profile: {
            type: 'object' as const,
            required: true,
            properties: {
              bio: { type: 'string' as const, required: true },
            },
          },
        },
      },
    };
    const result = validateParams(
      { user: { profile: { bio: 'Hello!' } } },
      deepSchema,
    );
    expect(result).toBeDefined();

    expect(() =>
      validateParams({ user: { profile: { bio: 99 } } }, deepSchema),
    ).toThrow(SurfError);
  });
});

describe('validateParams – arrays', () => {
  const schema = {
    tags: {
      type: 'array' as const,
      required: true,
      items: { type: 'string' as const },
    },
  };

  it('accepts valid array of strings', () => {
    const result = validateParams({ tags: ['a', 'b', 'c'] }, schema);
    expect(result['tags']).toEqual(['a', 'b', 'c']);
  });

  it('accepts empty array', () => {
    const result = validateParams({ tags: [] }, schema);
    expect(result['tags']).toEqual([]);
  });

  it('rejects array with wrong item types', () => {
    expect(() =>
      validateParams({ tags: ['a', 2, 'c'] }, schema),
    ).toThrow(SurfError);
  });

  it('error references the bad index', () => {
    try {
      validateParams({ tags: ['a', 2, 'c'] }, schema);
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as SurfError).message).toContain('tags[1]');
    }
  });

  it('rejects when param is not an array', () => {
    expect(() =>
      validateParams({ tags: 'not-an-array' }, schema),
    ).toThrow(SurfError);
  });

  it('validates array of numbers', () => {
    const numSchema = {
      ids: { type: 'array' as const, required: true, items: { type: 'number' as const } },
    };
    const result = validateParams({ ids: [1, 2, 3] }, numSchema);
    expect(result['ids']).toEqual([1, 2, 3]);

    expect(() =>
      validateParams({ ids: [1, 'two', 3] }, numSchema),
    ).toThrow(SurfError);
  });
});

// ─── validateResult ──────────────────────────────────────────────────────────

describe('validateResult', () => {
  it('passes when result matches primitive type', () => {
    expect(() => validateResult(42, { type: 'number' }, 'cmd')).not.toThrow();
    expect(() => validateResult('hello', { type: 'string' }, 'cmd')).not.toThrow();
    expect(() => validateResult(true, { type: 'boolean' }, 'cmd')).not.toThrow();
  });

  it('throws INTERNAL_ERROR when result type mismatches', () => {
    expect(() => validateResult('oops', { type: 'number' }, 'cmd')).toThrow(SurfError);
    try {
      validateResult(42, { type: 'string' }, 'myCommand');
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SurfError);
      expect((e as SurfError).code).toBe('INTERNAL_ERROR');
    }
  });

  it('error message includes the command name', () => {
    try {
      validateResult('bad', { type: 'number' }, 'getCount');
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as SurfError).message).toContain('getCount');
    }
  });

  it('validates object shape – passes correct shape', () => {
    expect(() =>
      validateResult(
        { name: 'Alice', age: 30 },
        { type: 'object', properties: { name: { type: 'string', required: true }, age: { type: 'number', required: true } } },
        'getUser',
      ),
    ).not.toThrow();
  });

  it('validates object shape – rejects wrong property type', () => {
    expect(() =>
      validateResult(
        { name: 'Alice', age: 'thirty' },
        { type: 'object', properties: { name: { type: 'string', required: true }, age: { type: 'number', required: true } } },
        'getUser',
      ),
    ).toThrow(SurfError);
  });

  it('validates object shape – rejects missing required property', () => {
    expect(() =>
      validateResult(
        { name: 'Alice' },
        { type: 'object', properties: { name: { type: 'string', required: true }, age: { type: 'number', required: true } } },
        'getUser',
      ),
    ).toThrow(SurfError);
  });

  it('passes array result without item schema check', () => {
    expect(() =>
      validateResult([1, 2, 3], { type: 'array' }, 'listItems'),
    ).not.toThrow();
  });

  it('throws when null is returned for non-null schema', () => {
    expect(() => validateResult(null, { type: 'string' }, 'cmd')).toThrow(SurfError);
  });
});
