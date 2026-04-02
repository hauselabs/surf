import { describe, it, expect, vi } from 'vitest';
import { createSurf } from '../src/surf.js';
import type { AuthVerifier } from '../src/auth.js';
import { timingSafeEqual } from '../src/auth.js';

describe('Auth', () => {
  const verifier: AuthVerifier = async (token, _command) => {
    if (token === 'valid-token') {
      return { valid: true, claims: { userId: '123' } };
    }
    return { valid: false, reason: 'Invalid token' };
  };

  async function createApp() {
    return await createSurf({
      name: 'AuthTest',
      authVerifier: verifier,
      commands: {
        public: {
          description: 'Public command',
          auth: 'none',
          run: async () => 'public-data',
        },
        secret: {
          description: 'Secret command',
          auth: 'required',
          run: async (_p, ctx) => ({ claims: ctx.claims }),
        },
        optional: {
          description: 'Optional auth',
          auth: 'optional',
          run: async (_p, ctx) => ({ hasClaims: !!ctx.claims }),
        },
      },
    });
  }

  it('calls auth verifier with token', async () => {
    const spy = vi.fn(verifier);
    const app = await createSurf({
      name: 'AuthTest',
      authVerifier: spy,
      commands: {
        secret: {
          description: 'Secret',
          auth: 'required',
          run: async () => 'ok',
        },
      },
    });

    await app.commands.execute('secret', {}, { auth: 'valid-token' });
    expect(spy).toHaveBeenCalledWith('valid-token', 'secret');
  });

  it('returns AUTH_REQUIRED when no token and command requires auth', async () => {
    const app = await createApp();
    const result = await app.commands.execute('secret', {}, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('AUTH_REQUIRED');
    }
  });

  it('returns AUTH_FAILED when verifier returns false', async () => {
    const app = await createApp();
    const result = await app.commands.execute('secret', {}, { auth: 'bad-token' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('AUTH_FAILED');
    }
  });

  it('allows public commands without auth', async () => {
    const app = await createApp();
    const result = await app.commands.execute('public', {}, {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result).toBe('public-data');
    }
  });

  it('passes claims to command context on valid auth', async () => {
    const app = await createApp();
    const result = await app.commands.execute('secret', {}, { auth: 'valid-token' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result).toEqual({ claims: { userId: '123' } });
    }
  });

  it('optional auth works without token', async () => {
    const app = await createApp();
    const result = await app.commands.execute('optional', {}, {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result).toEqual({ hasClaims: false });
    }
  });

  it('optional auth works with valid token', async () => {
    const app = await createApp();
    const result = await app.commands.execute('optional', {}, { auth: 'valid-token' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result).toEqual({ hasClaims: true });
    }
  });
});

describe('timingSafeEqual', () => {
  it('returns true for identical strings', async () => {
    expect(await timingSafeEqual('hello', 'hello')).toBe(true);
  });

  it('returns false for different strings of same length', async () => {
    expect(await timingSafeEqual('hello', 'world')).toBe(false);
  });

  it('returns false for strings of different lengths', async () => {
    expect(await timingSafeEqual('short', 'muchlongerstring')).toBe(false);
    expect(await timingSafeEqual('muchlongerstring', 'short')).toBe(false);
  });

  it('returns true for empty strings', async () => {
    expect(await timingSafeEqual('', '')).toBe(true);
  });

  it('returns false when one string is empty', async () => {
    expect(await timingSafeEqual('', 'notempty')).toBe(false);
    expect(await timingSafeEqual('notempty', '')).toBe(false);
  });

  it('handles unicode strings correctly', async () => {
    expect(await timingSafeEqual('héllo', 'héllo')).toBe(true);
    expect(await timingSafeEqual('héllo', 'hëllo')).toBe(false);
  });

  it('handles token-like strings', async () => {
    const tokenA = 'sk-abc123def456ghi789jkl012mno345';
    const tokenB = 'sk-abc123def456ghi789jkl012mno345';
    const tokenC = 'sk-abc123def456ghi789jkl012mno346';
    expect(await timingSafeEqual(tokenA, tokenB)).toBe(true);
    expect(await timingSafeEqual(tokenA, tokenC)).toBe(false);
  });

  it('works with fallback when crypto.subtle is unavailable', async () => {
    const originalSubtle = globalThis.crypto?.subtle;
    try {
      // Temporarily remove crypto.subtle to trigger fallback
      Object.defineProperty(globalThis.crypto, 'subtle', {
        value: undefined,
        configurable: true,
        writable: true,
      });
      expect(await timingSafeEqual('test', 'test')).toBe(true);
      expect(await timingSafeEqual('test', 'nope')).toBe(false);
      expect(await timingSafeEqual('short', 'longervalue')).toBe(false);
    } finally {
      Object.defineProperty(globalThis.crypto, 'subtle', {
        value: originalSubtle,
        configurable: true,
        writable: true,
      });
    }
  });
});
