import type { PaginatedResult } from './types.js';

/**
 * Build a standard paginated result envelope.
 *
 * If `hasMore` is not explicitly provided, it is derived from `nextCursor`:
 * - `nextCursor` is a non-empty string → `hasMore: true`
 * - `nextCursor` is `null`, `undefined`, or empty → `hasMore: false`
 *
 * @param items - The items for this page.
 * @param opts - Pagination metadata (cursor, total count, has-more flag).
 * @returns A {@link PaginatedResult} envelope.
 *
 * @example
 * ```ts
 * const result = paginatedResult(users.slice(0, 20), {
 *   nextCursor: users.length > 20 ? lastId : null,
 *   total: totalCount,
 * });
 * // → { items: [...], hasMore: true, nextCursor: '...', total: 42 }
 * ```
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
