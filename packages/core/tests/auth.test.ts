import { describe, it, expect, vi } from 'vitest';
import { createSurf } from '../src/surf.js';
import type { AuthVerifier } from '../src/auth.js';

describe('Auth', () => {
  const verifier: AuthVerifier = async (token, _command) => {
    if (token === 'valid-token') {
      return { valid: true, claims: { userId: '123' } };
    }
    return { valid: false, reason: 'Invalid token' };
  };

  function createApp() {
    return createSurf({
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
    const app = createSurf({
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
    const app = createApp();
    const result = await app.commands.execute('secret', {}, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('AUTH_REQUIRED');
    }
  });

  it('returns AUTH_FAILED when verifier returns false', async () => {
    const app = createApp();
    const result = await app.commands.execute('secret', {}, { auth: 'bad-token' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('AUTH_FAILED');
    }
  });

  it('allows public commands without auth', async () => {
    const app = createApp();
    const result = await app.commands.execute('public', {}, {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result).toBe('public-data');
    }
  });

  it('passes claims to command context on valid auth', async () => {
    const app = createApp();
    const result = await app.commands.execute('secret', {}, { auth: 'valid-token' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result).toEqual({ claims: { userId: '123' } });
    }
  });

  it('optional auth works without token', async () => {
    const app = createApp();
    const result = await app.commands.execute('optional', {}, {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result).toEqual({ hasClaims: false });
    }
  });

  it('optional auth works with valid token', async () => {
    const app = createApp();
    const result = await app.commands.execute('optional', {}, { auth: 'valid-token' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result).toEqual({ hasClaims: true });
    }
  });
});
