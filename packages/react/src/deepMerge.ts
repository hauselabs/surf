/**
 * Check if a value is a plain object (not an array, null, Date, RegExp, etc.).
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Recursively deep-merge `source` into `target`.
 *
 * - Plain objects are merged recursively.
 * - Arrays replace the target value (no concatenation).
 * - Primitives, null, and non-plain objects replace the target value.
 *
 * Returns a new object — neither `target` nor `source` is mutated.
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Record<string, unknown>,
): T {
  const result: Record<string, unknown> = { ...target };

  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = result[key];

    if (isPlainObject(srcVal) && isPlainObject(tgtVal)) {
      result[key] = deepMerge(tgtVal, srcVal);
    } else {
      result[key] = srcVal;
    }
  }

  return result as T;
}
