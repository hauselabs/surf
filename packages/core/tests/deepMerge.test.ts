import { describe, it, expect } from 'vitest';
import { deepMerge } from '../src/deepMerge.js';

describe('deepMerge', () => {
  it('merges flat objects', () => {
    const result = deepMerge({ a: 1, b: 2 }, { b: 3, c: 4 });
    expect(result).toEqual({ a: 1, b: 3, c: 4 });
  });

  it('recursively merges nested objects', () => {
    const target = { a: { x: 1, y: 2 }, b: 'hello' };
    const source = { a: { y: 3, z: 4 } };
    const result = deepMerge(target, source);
    expect(result).toEqual({ a: { x: 1, y: 3, z: 4 }, b: 'hello' });
  });

  it('replaces arrays (no concatenation)', () => {
    const result = deepMerge({ items: [1, 2, 3] }, { items: [4, 5] });
    expect(result).toEqual({ items: [4, 5] });
  });

  it('replaces primitives', () => {
    const result = deepMerge({ a: 'old', b: 42 }, { a: 'new', b: 99 });
    expect(result).toEqual({ a: 'new', b: 99 });
  });

  it('does not mutate target', () => {
    const target = { a: { x: 1 } };
    const source = { a: { y: 2 } };
    deepMerge(target, source);
    expect(target).toEqual({ a: { x: 1 } });
  });

  it('does not mutate source', () => {
    const target = { a: 1 };
    const source = { b: { nested: true } };
    deepMerge(target, source);
    expect(source).toEqual({ b: { nested: true } });
  });

  it('handles null values in source', () => {
    const result = deepMerge({ a: { x: 1 } }, { a: null as unknown as Record<string, unknown> });
    expect(result).toEqual({ a: null });
  });

  it('replaces non-plain objects (Date, RegExp)', () => {
    const date = new Date('2026-01-01');
    const result = deepMerge({ a: 'old' }, { a: date as unknown as Record<string, unknown> });
    expect(result.a).toBe(date);
  });

  it('deeply merges three levels', () => {
    const target = { a: { b: { c: 1, d: 2 } } };
    const source = { a: { b: { c: 99, e: 3 } } };
    const result = deepMerge(target, source);
    expect(result).toEqual({ a: { b: { c: 99, d: 2, e: 3 } } });
  });

  it('handles empty source', () => {
    const target = { a: 1, b: 2 };
    const result = deepMerge(target, {});
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('handles empty target', () => {
    const result = deepMerge({} as Record<string, unknown>, { a: 1 });
    expect(result).toEqual({ a: 1 });
  });
});
