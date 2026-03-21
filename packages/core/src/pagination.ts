import type { PaginatedResult } from './types.js';

/**
 * Build a standard paginated result envelope.
 *
 * If `hasMore` is not explicitly provided, it is derived from `nextCursor`:
 * - `nextCursor` is a non-empty string → `hasMore: true`
 * - `nextCursor` is `null`, `undefined`, or empty → `hasMore: false`
 */
export function paginatedResult<T>(
  items: T[],
  opts: {
    nextCursor?: string | null;
    total?: number;
    hasMore?: boolean;
  } = {},
): PaginatedResult<T> {
  const hasMore = opts.hasMore ?? (typeof opts.nextCursor === 'string' && opts.nextCursor.length > 0);

  const result: PaginatedResult<T> = {
    items,
    hasMore,
  };

  if (opts.nextCursor !== undefined) {
    result.nextCursor = opts.nextCursor;
  }

  if (opts.total !== undefined) {
    result.total = opts.total;
  }

  return result;
}
