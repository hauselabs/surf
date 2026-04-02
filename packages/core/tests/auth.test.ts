import { describe, it, expect, vi } from 'vitest';
import { createSurf } from '../src/surf.js';
import type { AuthVerifier } from '../src/auth.js';
import { timingSafeEqual, bearerVerifier, scopedVerifier } from '../src/auth.js';

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

describe('bearerVerifier — no raw token in claims', () => {
  const TOKEN = 'sk-secret-test-token-12345';

  it('returns claims without raw token on valid auth', async () => {
    const verifier = bearerVerifier([TOKEN]);
    const result = await verifier(TOKEN, 'test');
    expect(result.valid).toBe(true);
    expect(result.claims).toBeDefined();
    expect(result.claims).not.toHaveProperty('token');
    expect(result.claims!.sub).toBe('bearer');
    expect(result.claims!.tokenId).toMatch(/^[0-9a-f]{16}$/);
  });

  it('returns consistent tokenId for the same token', async () => {
    const verifier = bearerVerifier([TOKEN]);
    const r1 = await verifier(TOKEN, 'a');
    const r2 = await verifier(TOKEN, 'b');
    expect(r1.claims!.tokenId).toBe(r2.claims!.tokenId);
  });

  it('returns different tokenId for different tokens', async () => {
    const token2 = 'sk-other-token-67890';
    const verifier = bearerVerifier([TOKEN, token2]);
    const r1 = await verifier(TOKEN, 'cmd');
    const r2 = await verifier(token2, 'cmd');
    expect(r1.claims!.tokenId).not.toBe(r2.claims!.tokenId);
  });

  it('rejects invalid tokens', async () => {
    const verifier = bearerVerifier([TOKEN]);
    const result = await verifier('bad-token', 'cmd');
    expect(result.valid).toBe(false);
  });
});

describe('scopedVerifier — no raw token in claims', () => {
  const TOKEN = 'sk-scoped-token-abc';

  it('returns claims without raw token on valid auth', async () => {
    const verifier = scopedVerifier({ [TOKEN]: ['read', 'write'] });
    const result = await verifier(TOKEN, 'test');
    expect(result.valid).toBe(true);
    expect(result.claims).not.toHaveProperty('token');
    expect(result.claims!.sub).toBe('bearer');
    expect(result.claims!.tokenId).toMatch(/^[0-9a-f]{16}$/);
    expect(result.scopes).toEqual(['read', 'write']);
  });

  it('rejects unknown tokens', async () => {
    const verifier = scopedVerifier({ [TOKEN]: ['read'] });
    const result = await verifier('unknown', 'cmd');
    expect(result.valid).toBe(false);
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
