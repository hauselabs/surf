import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from '../src/ratelimit.js';
import { SurfError } from '../src/errors.js';
import { CommandRegistry } from '../src/commands.js';

describe('RateLimiter', () => {
  it('allows requests within the limit', () => {
    const limiter = new RateLimiter();
    const config = { windowMs: 1000, maxRequests: 3 };

    expect(() => limiter.check(config, 'test')).not.toThrow();
    expect(() => limiter.check(config, 'test')).not.toThrow();
    expect(() => limiter.check(config, 'test')).not.toThrow();
  });

  it('throws RATE_LIMITED after N requests', () => {
    const limiter = new RateLimiter();
    const config = { windowMs: 1000, maxRequests: 2 };

    limiter.check(config, 'test');
    limiter.check(config, 'test');

    try {
      limiter.check(config, 'test');
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SurfError);
      expect((e as SurfError).code).toBe('RATE_LIMITED');
    }
  });

  it('RATE_LIMITED error includes retryAfterMs', () => {
    const limiter = new RateLimiter();
    const config = { windowMs: 5000, maxRequests: 1 };

    limiter.check(config, 'test');

    try {
      limiter.check(config, 'test');
      expect.fail('Should have thrown');
    } catch (e) {
      const retryMs = RateLimiter.retryAfterMs(e as SurfError);
      expect(retryMs).toBeGreaterThan(0);
      expect(retryMs).toBeLessThanOrEqual(5000);
    }
  });

  it('sliding window resets after windowMs', async () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter();
    const config = { windowMs: 100, maxRequests: 1 };

    limiter.check(config, 'test');
    expect(() => limiter.check(config, 'test')).toThrow();

    vi.advanceTimersByTime(150);

    // After window passes, should be allowed again
    expect(() => limiter.check(config, 'test')).not.toThrow();
    vi.useRealTimers();
  });

  it('per-command rate limits via CommandRegistry', async () => {
    const registry = new CommandRegistry({
      fast: {
        description: 'Fast command',
        rateLimit: { windowMs: 10000, maxRequests: 1, keyBy: 'global' },
        run: async () => 'ok',
      },
      slow: {
        description: 'Slow command',
        run: async () => 'ok',
      },
    });

    // First call succeeds
    const r1 = await registry.execute('fast', {}, {});
    expect(r1.ok).toBe(true);

    // Second call is rate limited
    const r2 = await registry.execute('fast', {}, {});
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.error.code).toBe('RATE_LIMITED');
    }

    // Other command is unaffected
    const r3 = await registry.execute('slow', {}, {});
    expect(r3.ok).toBe(true);
  });

  it('buildKey produces different keys per keyBy strategy', () => {
    const config = { windowMs: 1000, maxRequests: 5 };
    const ctx = { ip: '1.2.3.4', sessionId: 'sess1', auth: 'tok1' };

    expect(RateLimiter.buildKey('cmd', { ...config, keyBy: 'ip' }, ctx)).toBe('cmd:ip:1.2.3.4');
    expect(RateLimiter.buildKey('cmd', { ...config, keyBy: 'session' }, ctx)).toBe('cmd:session:sess1');
    expect(RateLimiter.buildKey('cmd', { ...config, keyBy: 'auth' }, ctx)).toBe('cmd:auth:tok1');
    expect(RateLimiter.buildKey('cmd', { ...config, keyBy: 'global' }, ctx)).toBe('cmd:global');
  });

  it('buildKey defaults to ip when keyBy is omitted', () => {
    const config = { windowMs: 1000, maxRequests: 5 };
    const ctx = { ip: '1.2.3.4', sessionId: 'sess1', auth: 'tok1' };

    // No keyBy specified — should default to 'ip'
    expect(RateLimiter.buildKey('cmd', config, ctx)).toBe('cmd:ip:1.2.3.4');
  });

  it('per-IP rate limits isolate different IPs', () => {
    const limiter = new RateLimiter();
    const config = { windowMs: 10000, maxRequests: 1 };

    // IP-based keys (default keyBy)
    const key1 = RateLimiter.buildKey('cmd', config, { ip: '1.1.1.1' });
    const key2 = RateLimiter.buildKey('cmd', config, { ip: '2.2.2.2' });

    limiter.check(config, key1);
    // Same IP should be blocked
    expect(() => limiter.check(config, key1)).toThrow();
    // Different IP should still work
    expect(() => limiter.check(config, key2)).not.toThrow();
  });
});
