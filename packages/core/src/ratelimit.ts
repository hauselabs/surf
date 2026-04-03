import type { RateLimitConfig } from './types.js';
import { rateLimited } from './errors.js';
import type { SurfError } from './errors.js';

interface WindowEntry {
  timestamps: number[];
}

/**
 * Sliding window rate limiter — pure in-memory, no external dependencies.
 *
 * Tracks request timestamps per key within a configurable time window.
 * Automatically cleans up stale entries to prevent memory leaks.
 *
 * @example
 * ```ts
 * const limiter = new RateLimiter();
 * const config = { windowMs: 60_000, maxRequests: 100, keyBy: 'ip' as const };
 * const key = RateLimiter.buildKey('users.list', config, { ip: '1.2.3.4' });
 *
 * try {
 *   limiter.check(config, key);
 * } catch (err) {
 *   // err is a SurfError with code 'RATE_LIMITED'
 * }
 * ```
 */
export class RateLimiter {
  private readonly windows = new Map<string, WindowEntry>();
  private lastCleanup = Date.now();
  private static readonly CLEANUP_INTERVAL_MS = 60_000;

  /**
   * Check if a request is allowed under the given rate limit config and key.
   *
   * If the request is within limits, it is recorded. If the limit is exceeded,
   * a `RATE_LIMITED` error is thrown with the retry-after time in details.
   *
   * @param config - Rate limit configuration (window size, max requests).
   * @param key - The bucket key (built via {@link RateLimiter.buildKey}).
   * @throws {SurfError} With code `RATE_LIMITED` and `retryAfterMs` in details.
   */
  check(config: RateLimitConfig, key: string): void {
    this.maybeCleanup(config.windowMs);
    const { windowMs, maxRequests } = config;
    const now = Date.now();
    const bucketKey = key;

    let entry = this.windows.get(bucketKey);
    if (!entry) {
      entry = { timestamps: [] };
      this.windows.set(bucketKey, entry);
    }

    // Prune timestamps outside the window
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

    if (entry.timestamps.length >= maxRequests) {
      const oldest = entry.timestamps[0]!;
      const retryAfterMs = windowMs - (now - oldest);
      throw rateLimited(retryAfterMs);
    }

    entry.timestamps.push(now);
  }

  /**
   * Periodically evict stale entries to prevent memory leaks.
   */
  private maybeCleanup(windowMs: number): void {
    const now = Date.now();
    if (now - this.lastCleanup < RateLimiter.CLEANUP_INTERVAL_MS) return;
    this.lastCleanup = now;

    for (const [key, entry] of this.windows) {
      entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
      if (entry.timestamps.length === 0) {
        this.windows.delete(key);
      }
    }
  }

  /**
   * Build the rate limit key for a command + context.
   *
   * @param command - The command name.
   * @param config - Rate limit config (uses `keyBy` to determine key strategy).
   * @param ctx - Execution context with optional `ip`, `sessionId`, and `auth`.
   * @returns A string key for the rate limit bucket.
   */
  static buildKey(
    command: string,
    config: RateLimitConfig,
    ctx: { ip?: string; sessionId?: string; auth?: string },
  ): string {
    const keyBy = config.keyBy ?? 'ip';
    switch (keyBy) {
      case 'ip':
        return `${command}:ip:${ctx.ip ?? 'unknown'}`;
      case 'session':
        return `${command}:session:${ctx.sessionId ?? 'unknown'}`;
      case 'auth':
        return `${command}:auth:${ctx.auth ?? 'unknown'}`;
      case 'global':
      default:
        return `${command}:global`;
    }
  }

  /**
   * Extract the retry-after milliseconds from a `RATE_LIMITED` {@link SurfError}.
   *
   * @param err - A SurfError (typically with code `RATE_LIMITED`).
   * @returns Milliseconds until the client can retry, or `0` if not available.
   */
  static retryAfterMs(err: SurfError): number {
    return (err.details?.['retryAfterMs'] as number | undefined) ?? 0;
  }
}
