import type { RateLimitConfig } from './types.js';
import { rateLimited } from './errors.js';
import type { SurfError } from './errors.js';

interface WindowEntry {
  timestamps: number[];
}

/**
 * Sliding window rate limiter — pure in-memory, no external dependencies.
 */
export class RateLimiter {
  private readonly windows = new Map<string, WindowEntry>();

  /**
   * Check if a request is allowed under the given config and key.
   * Throws SurfError with RATE_LIMITED if limit is exceeded.
   * Returns ms until the oldest entry expires (for Retry-After).
   */
  check(config: RateLimitConfig, key: string): void {
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
   * Build the rate limit key for a command + context.
   */
  static buildKey(
    command: string,
    config: RateLimitConfig,
    ctx: { ip?: string; sessionId?: string; auth?: string },
  ): string {
    const keyBy = config.keyBy ?? 'global';
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
   * Get the retry-after ms from a RATE_LIMITED SurfError, or 0.
   */
  static retryAfterMs(err: SurfError): number {
    return (err.details?.['retryAfterMs'] as number | undefined) ?? 0;
  }
}
