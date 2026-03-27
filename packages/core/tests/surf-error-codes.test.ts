import { describe, it, expect } from 'vitest';
import {
  SurfError,
  unknownCommand,
  notFound,
  invalidParams,
  authRequired,
  authFailed,
  sessionExpired,
  rateLimited,
  internalError,
  notSupported,
  assertNotPromise,
} from '../src/errors.js';
import { CommandRegistry } from '../src/commands.js';
import type { SurfErrorCode } from '../src/types.js';

// ─── SurfError class ──────────────────────────────────────────────────────────

describe('SurfError', () => {
  it('is an instance of Error', () => {
    const err = new SurfError('INTERNAL_ERROR', 'oops');
    expect(err).toBeInstanceOf(Error);
  });

  it('has name "SurfError"', () => {
    const err = new SurfError('NOT_FOUND', 'missing');
    expect(err.name).toBe('SurfError');
  });

  it('stores code on the error', () => {
    const err = new SurfError('INVALID_PARAMS', 'bad param');
    expect(err.code).toBe('INVALID_PARAMS');
  });

  it('stores message', () => {
    const err = new SurfError('AUTH_REQUIRED', 'need login');
    expect(err.message).toBe('need login');
  });

  it('stores optional details', () => {
    const err = new SurfError('INVALID_PARAMS', 'bad', { field: 'email' });
    expect(err.details).toEqual({ field: 'email' });
  });

  it('details is undefined when not provided', () => {
    const err = new SurfError('INTERNAL_ERROR', 'oops');
    expect(err.details).toBeUndefined();
  });

  it('toJSON includes code and message', () => {
    const err = new SurfError('RATE_LIMITED', 'slow down');
    const json = err.toJSON();
    expect(json.code).toBe('RATE_LIMITED');
    expect(json.message).toBe('slow down');
  });

  it('toJSON includes details when present', () => {
    const err = new SurfError('INVALID_PARAMS', 'bad', { errors: ['x'] });
    const json = err.toJSON();
    expect(json.details).toEqual({ errors: ['x'] });
  });

  it('toJSON omits details when not present', () => {
    const err = new SurfError('INTERNAL_ERROR', 'oops');
    const json = err.toJSON();
    expect(json).not.toHaveProperty('details');
  });
});

// ─── All error codes ─────────────────────────────────────────────────────────

describe('SurfErrorCode coverage – all 9 codes', () => {
  const allCodes: SurfErrorCode[] = [
    'UNKNOWN_COMMAND',
    'NOT_FOUND',
    'INVALID_PARAMS',
    'AUTH_REQUIRED',
    'AUTH_FAILED',
    'SESSION_EXPIRED',
    'RATE_LIMITED',
    'INTERNAL_ERROR',
    'NOT_SUPPORTED',
  ];

  it.each(allCodes)('can construct SurfError with code %s', (code) => {
    const err = new SurfError(code, `test message for ${code}`);
    expect(err.code).toBe(code);
    expect(err.message).toBe(`test message for ${code}`);
    expect(err.toJSON().code).toBe(code);
  });
});

// ─── Convenience constructors ─────────────────────────────────────────────────

describe('unknownCommand()', () => {
  it('has UNKNOWN_COMMAND code', () => {
    const err = unknownCommand('foo.bar');
    expect(err.code).toBe('UNKNOWN_COMMAND');
  });

  it('includes command name in message', () => {
    const err = unknownCommand('doThing');
    expect(err.message).toContain('doThing');
  });

  it('stores command in details', () => {
    const err = unknownCommand('x');
    expect(err.details?.['command']).toBe('x');
  });
});

describe('notFound()', () => {
  it('has NOT_FOUND code', () => {
    expect(notFound('User').code).toBe('NOT_FOUND');
  });

  it('includes resource in message', () => {
    const err = notFound('Article');
    expect(err.message).toContain('Article');
  });

  it('includes id in message when provided', () => {
    const err = notFound('Post', '123');
    expect(err.message).toContain('Post');
    expect(err.message).toContain('123');
  });

  it('omits id from message when not provided', () => {
    const err = notFound('Post');
    expect(err.message).not.toContain('undefined');
  });

  it('stores resource in details', () => {
    const err = notFound('Doc', 'abc');
    expect(err.details?.['resource']).toBe('Doc');
    expect(err.details?.['id']).toBe('abc');
  });
});

describe('invalidParams()', () => {
  it('has INVALID_PARAMS code', () => {
    expect(invalidParams('bad input').code).toBe('INVALID_PARAMS');
  });

  it('passes custom message through', () => {
    const err = invalidParams('name is required');
    expect(err.message).toBe('name is required');
  });

  it('stores optional details', () => {
    const err = invalidParams('bad', { errors: ['missing name'] });
    expect(err.details?.['errors']).toEqual(['missing name']);
  });
});

describe('authRequired()', () => {
  it('has AUTH_REQUIRED code', () => {
    expect(authRequired().code).toBe('AUTH_REQUIRED');
  });

  it('works without arguments', () => {
    const err = authRequired();
    expect(err.message).toContain('Authentication');
  });

  it('includes command name when provided', () => {
    const err = authRequired('admin.delete');
    expect(err.message).toContain('admin.delete');
  });
});

describe('authFailed()', () => {
  it('has AUTH_FAILED code', () => {
    expect(authFailed().code).toBe('AUTH_FAILED');
  });

  it('has default message without args', () => {
    const err = authFailed();
    expect(err.message).toBeTruthy();
  });

  it('uses custom reason when provided', () => {
    const err = authFailed('token expired');
    expect(err.message).toBe('token expired');
  });
});

describe('sessionExpired()', () => {
  it('has SESSION_EXPIRED code', () => {
    expect(sessionExpired().code).toBe('SESSION_EXPIRED');
  });

  it('has descriptive message', () => {
    const err = sessionExpired();
    expect(err.message.length).toBeGreaterThan(0);
  });

  it('accepts optional session id', () => {
    // Should not throw with or without id
    expect(() => sessionExpired('sess-123')).not.toThrow();
    expect(() => sessionExpired()).not.toThrow();
  });
});

describe('rateLimited()', () => {
  it('has RATE_LIMITED code', () => {
    expect(rateLimited().code).toBe('RATE_LIMITED');
  });

  it('has message without args', () => {
    const err = rateLimited();
    expect(err.message).toBeTruthy();
  });

  it('includes retryAfterMs in details when provided', () => {
    const err = rateLimited(5000);
    expect(err.details?.['retryAfterMs']).toBe(5000);
  });

  it('has no details when retryAfterMs not provided', () => {
    const err = rateLimited();
    expect(err.details).toBeUndefined();
  });
});

describe('internalError()', () => {
  it('has INTERNAL_ERROR code', () => {
    expect(internalError().code).toBe('INTERNAL_ERROR');
  });

  it('has default message without args', () => {
    const err = internalError();
    expect(err.message).toBeTruthy();
  });

  it('uses custom message when provided', () => {
    const err = internalError('database unavailable');
    expect(err.message).toBe('database unavailable');
  });
});

describe('notSupported()', () => {
  it('has NOT_SUPPORTED code', () => {
    expect(notSupported('stream.connect').code).toBe('NOT_SUPPORTED');
  });

  it('includes command name in message', () => {
    const err = notSupported('ws.subscribe');
    expect(err.message).toContain('ws.subscribe');
  });

  it('stores command in details', () => {
    const err = notSupported('foo');
    expect(err.details?.['command']).toBe('foo');
  });
});

// ─── assertNotPromise guard ───────────────────────────────────────────────────

describe('assertNotPromise()', () => {
  it('does not throw for non-promise values', () => {
    expect(() => assertNotPromise({})).not.toThrow();
    expect(() => assertNotPromise(null)).not.toThrow();
    expect(() => assertNotPromise('string')).not.toThrow();
    expect(() => assertNotPromise(42)).not.toThrow();
  });

  it('throws when given a Promise-like (has .then)', () => {
    const fakePromise = { then: () => {} };
    expect(() => assertNotPromise(fakePromise)).toThrow(/await/);
  });

  it('throws with helpful message about await', () => {
    expect(() => assertNotPromise(Promise.resolve({}))).toThrow(/await/i);
  });
});

// ─── CommandRegistry – SurfError propagation ─────────────────────────────────

describe('CommandRegistry – SurfError propagation via execute()', () => {
  it('handler throwing SurfError returns the error verbatim', async () => {
    const registry = new CommandRegistry({
      notfound: {
        description: 'Not found test',
        run: async () => { throw notFound('Widget', 'w-99'); },
      },
    });

    const result = await registry.execute('notfound', {}, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
      expect(result.error.message).toContain('w-99');
    }
  });

  it('handler throwing authFailed returns AUTH_FAILED code', async () => {
    const registry = new CommandRegistry({
      restricted: {
        description: 'Access denied',
        run: async () => { throw authFailed('bad token'); },
      },
    });

    const result = await registry.execute('restricted', {}, {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('AUTH_FAILED');
  });

  it('handler throwing rateLimited returns RATE_LIMITED code', async () => {
    const registry = new CommandRegistry({
      limited: {
        description: 'Rate limited command',
        run: async () => { throw rateLimited(2000); },
      },
    });

    const result = await registry.execute('limited', {}, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('RATE_LIMITED');
    }
  });

  it('handler throwing sessionExpired returns SESSION_EXPIRED code', async () => {
    const registry = new CommandRegistry({
      check: {
        description: 'Session check',
        run: async () => { throw sessionExpired(); },
      },
    });

    const result = await registry.execute('check', {}, {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('SESSION_EXPIRED');
  });

  it('handler throwing notSupported returns NOT_SUPPORTED code', async () => {
    const registry = new CommandRegistry({
      ws: {
        description: 'WS feature',
        run: async () => { throw notSupported('ws'); },
      },
    });

    const result = await registry.execute('ws', {}, {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_SUPPORTED');
  });
});
