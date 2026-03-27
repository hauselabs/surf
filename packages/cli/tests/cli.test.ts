/**
 * @surfjs/cli — Comprehensive tests
 *
 * Covers:
 *  - parseArgs: all flag combinations
 *  - buildHeaders: Content-Type, Bearer auth
 *  - coerceValue: string → number/boolean/string
 *  - syntaxHighlightJson: non-TTY passthrough (no ANSI)
 *  - ping: success, not-found, network error (--json and human output)
 *  - inspect: manifest rendering, verbose, --json, 404 error
 *  - test: command not found, browser-only guard, auth guard,
 *          missing required params (--json), default application,
 *          successful execution (ok=true), error response (ok=false)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseArgs,
  buildHeaders,
  coerceValue,
  syntaxHighlightJson,
  ping,
  inspect,
  test as cliTest,
} from '../src/index.js';
import type { ParsedArgs, SurfManifest } from '../src/index.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal ParsedArgs with sensible defaults */
function mkOpts(overrides: Partial<ParsedArgs> = {}): ParsedArgs {
  return {
    command: undefined,
    url: undefined,
    subcommand: undefined,
    params: {},
    json: false,
    auth: undefined,
    verbose: false,
    basePath: undefined,
    ...overrides,
  };
}

/** Capture console.log / console.error output during an async block */
async function captureOutput(fn: () => Promise<void>): Promise<{ log: string; err: string }> {
  const logLines: string[] = [];
  const errLines: string[] = [];
  const spyLog = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logLines.push(args.map(String).join(' '));
  });
  const spyErr = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errLines.push(args.map(String).join(' '));
  });
  try {
    await fn();
  } finally {
    spyLog.mockRestore();
    spyErr.mockRestore();
  }
  return { log: logLines.join('\n'), err: errLines.join('\n') };
}

/** Make process.exit a no-op spy (restores after each test) */
function mockExit() {
  return vi.spyOn(process, 'exit').mockImplementation((_code?: string | number | null | undefined) => {
    throw new Error(`process.exit(${_code})`);
  });
}

/** Helper to build a mock fetch from a simple manifest */
function manifestFetch(manifest: SurfManifest, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => manifest,
  });
}

// ─── parseArgs ────────────────────────────────────────────────────────────────

describe('parseArgs', () => {
  it('parses inspect command with url', () => {
    const args = parseArgs(['inspect', 'https://example.com']);
    expect(args.command).toBe('inspect');
    expect(args.url).toBe('https://example.com');
    expect(args.subcommand).toBeUndefined();
    expect(args.json).toBe(false);
    expect(args.verbose).toBe(false);
    expect(args.auth).toBeUndefined();
    expect(args.basePath).toBeUndefined();
  });

  it('parses ping command', () => {
    const args = parseArgs(['ping', 'https://example.com']);
    expect(args.command).toBe('ping');
    expect(args.url).toBe('https://example.com');
  });

  it('parses test command with subcommand and named params', () => {
    const args = parseArgs(['test', 'https://example.com', 'search', '--query', 'shoes', '--limit', '5']);
    expect(args.command).toBe('test');
    expect(args.url).toBe('https://example.com');
    expect(args.subcommand).toBe('search');
    expect(args.params).toEqual({ query: 'shoes', limit: '5' });
  });

  it('parses --json flag', () => {
    const args = parseArgs(['ping', 'https://example.com', '--json']);
    expect(args.json).toBe(true);
  });

  it('parses --verbose flag', () => {
    const args = parseArgs(['inspect', 'https://example.com', '--verbose']);
    expect(args.verbose).toBe(true);
  });

  it('parses --auth flag', () => {
    const args = parseArgs(['inspect', 'https://example.com', '--auth', 'my-secret-token']);
    expect(args.auth).toBe('my-secret-token');
  });

  it('parses --base-path flag', () => {
    const args = parseArgs(['test', 'https://example.com', 'cmd', '--base-path', '/api/surf/execute']);
    expect(args.basePath).toBe('/api/surf/execute');
  });

  it('parses --basePath alias', () => {
    const args = parseArgs(['test', 'https://example.com', 'cmd', '--basePath', '/api/surf/execute']);
    expect(args.basePath).toBe('/api/surf/execute');
  });

  it('handles multiple flags together', () => {
    const args = parseArgs([
      'test', 'https://example.com', 'search',
      '--query', 'blue shoes',
      '--json',
      '--auth', 'tok123',
      '--verbose',
    ]);
    expect(args.json).toBe(true);
    expect(args.auth).toBe('tok123');
    expect(args.verbose).toBe(true);
    expect(args.params.query).toBe('blue shoes');
  });

  it('returns undefined command for empty argv', () => {
    const args = parseArgs([]);
    expect(args.command).toBeUndefined();
    expect(args.url).toBeUndefined();
  });

  it('ignores unknown flags without values', () => {
    const args = parseArgs(['inspect', 'https://example.com', '--unknown-solo']);
    // Should not throw; unknown flags are skipped
    expect(args.command).toBe('inspect');
  });

  it('collects unknown --key value pairs as params for test', () => {
    const args = parseArgs(['test', 'https://example.com', 'cmd', '--foo', 'bar', '--baz', 'qux']);
    expect(args.params).toEqual({ foo: 'bar', baz: 'qux' });
  });
});

// ─── buildHeaders ─────────────────────────────────────────────────────────────

describe('buildHeaders', () => {
  it('always includes Content-Type application/json', () => {
    const h = buildHeaders();
    expect(h['Content-Type']).toBe('application/json');
  });

  it('adds Authorization header when auth token provided', () => {
    const h = buildHeaders('my-token');
    expect(h['Authorization']).toBe('Bearer my-token');
  });

  it('does not include Authorization when no auth', () => {
    const h = buildHeaders();
    expect(h).not.toHaveProperty('Authorization');
  });

  it('handles empty string auth (no header added)', () => {
    const h = buildHeaders('');
    // Empty string is falsy — no Authorization header
    expect(h).not.toHaveProperty('Authorization');
  });
});

// ─── coerceValue ─────────────────────────────────────────────────────────────

describe('coerceValue', () => {
  it('returns string unchanged when type is string', () => {
    expect(coerceValue('hello', 'string')).toBe('hello');
  });

  it('returns string unchanged when type is undefined', () => {
    expect(coerceValue('hello')).toBe('hello');
  });

  it('converts numeric string to number', () => {
    expect(coerceValue('42', 'number')).toBe(42);
    expect(coerceValue('3.14', 'number')).toBe(3.14);
  });

  it('returns original string if numeric parse fails', () => {
    expect(coerceValue('abc', 'number')).toBe('abc');
  });

  it('converts "true" to boolean true', () => {
    expect(coerceValue('true', 'boolean')).toBe(true);
  });

  it('converts "1" to boolean true', () => {
    expect(coerceValue('1', 'boolean')).toBe(true);
  });

  it('converts "false" to boolean false', () => {
    expect(coerceValue('false', 'boolean')).toBe(false);
  });

  it('converts "0" to boolean false', () => {
    expect(coerceValue('0', 'boolean')).toBe(false);
  });

  it('converts "yes" to boolean false (only "true" and "1" are truthy)', () => {
    expect(coerceValue('yes', 'boolean')).toBe(false);
  });

  it('returns string for unknown type', () => {
    expect(coerceValue('hello', 'array')).toBe('hello');
  });
});

// ─── syntaxHighlightJson ─────────────────────────────────────────────────────

describe('syntaxHighlightJson', () => {
  it('returns valid JSON string (no ANSI in non-TTY environment)', () => {
    // isTTY is false in test environment; c.* are all empty strings
    const result = syntaxHighlightJson({ name: 'surf', count: 3, active: true, nothing: null });
    // Must be parseable (even if ANSI codes are present, they don't break structure)
    const stripped = result.replace(/\x1b\[[0-9;]*m/g, '');
    expect(() => JSON.parse(stripped)).not.toThrow();
  });

  it('formats nested objects', () => {
    const result = syntaxHighlightJson({ a: { b: 1 } });
    const stripped = result.replace(/\x1b\[[0-9;]*m/g, '');
    expect(JSON.parse(stripped)).toEqual({ a: { b: 1 } });
  });

  it('formats arrays', () => {
    const result = syntaxHighlightJson([1, 'two', true]);
    const stripped = result.replace(/\x1b\[[0-9;]*m/g, '');
    expect(JSON.parse(stripped)).toEqual([1, 'two', true]);
  });

  it('handles null value', () => {
    const result = syntaxHighlightJson(null);
    expect(result.trim()).toBe('null');
  });

  it('handles primitive number', () => {
    const result = syntaxHighlightJson(42);
    expect(result.trim()).toBe('42');
  });
});

// ─── ping command ────────────────────────────────────────────────────────────

describe('ping', () => {
  let exitSpy: ReturnType<typeof mockExit>;

  beforeEach(() => {
    exitSpy = mockExit();
  });

  afterEach(() => {
    exitSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('outputs success JSON when site is Surf-enabled (--json)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const { log } = await captureOutput(() =>
      ping('https://acme.com', mkOpts({ json: true })),
    );

    const parsed = JSON.parse(log);
    expect(parsed.ok).toBe(true);
    expect(parsed.status).toBe(200);
    expect(typeof parsed.ms).toBe('number');
  });

  it('outputs failure JSON with ok:false when site returns non-ok (--json)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    // In --json mode ping always logs and returns (no process.exit); ok:false indicates failure
    const { log } = await captureOutput(() =>
      ping('https://acme.com', mkOpts({ json: true })),
    );

    const parsed = JSON.parse(log);
    expect(parsed.ok).toBe(false);
    expect(parsed.status).toBe(404);
  });

  it('exits(1) and outputs JSON error on fetch failure (--json)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    await expect(
      captureOutput(() => ping('https://acme.com', mkOpts({ json: true }))),
    ).rejects.toThrow('process.exit(1)');
  });

  it('outputs human-readable success when not --json', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const { log } = await captureOutput(() =>
      ping('https://acme.com', mkOpts({ json: false })),
    );

    expect(log).toContain('acme.com');
    expect(log).toContain('Surf-enabled');
  });

  it('passes auth header to manifest request', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', mockFetch);

    await captureOutput(() =>
      ping('https://acme.com', mkOpts({ auth: 'secret-token' })),
    );

    const [, fetchOpts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = fetchOpts.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer secret-token');
  });
});

// ─── inspect command ──────────────────────────────────────────────────────────

describe('inspect', () => {
  let exitSpy: ReturnType<typeof mockExit>;

  const MANIFEST: SurfManifest = {
    surf: '0.1.0',
    name: 'Test Shop',
    description: 'An e-commerce Surf API',
    version: '1.0.0',
    commands: {
      search: {
        description: 'Search products',
        params: {
          query: { type: 'string', required: true, description: 'Search term' },
          limit: { type: 'number', required: false, default: 10 },
        },
      },
      checkout: {
        description: 'Checkout cart',
        auth: 'required',
        hints: { execution: 'server' as const },
      },
      browse: {
        description: 'Browse products',
        hints: { execution: 'browser' as const },
      },
    },
  };

  beforeEach(() => {
    exitSpy = mockExit();
  });

  afterEach(() => {
    exitSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('returns JSON manifest on --json flag', async () => {
    vi.stubGlobal('fetch', manifestFetch(MANIFEST));

    const { log } = await captureOutput(() =>
      inspect('https://shop.com', mkOpts({ json: true })),
    );

    const parsed = JSON.parse(log);
    expect(parsed.ok).toBe(true);
    expect(parsed.manifest.name).toBe('Test Shop');
    expect(typeof parsed.ms).toBe('number');
  });

  it('shows command count in human output', async () => {
    vi.stubGlobal('fetch', manifestFetch(MANIFEST));

    const { log } = await captureOutput(() =>
      inspect('https://shop.com', mkOpts({ json: false })),
    );

    expect(log).toContain('3 commands');
    expect(log).toContain('search');
    expect(log).toContain('checkout');
  });

  it('shows description when present', async () => {
    vi.stubGlobal('fetch', manifestFetch(MANIFEST));

    const { log } = await captureOutput(() =>
      inspect('https://shop.com', mkOpts({ json: false })),
    );

    expect(log).toContain('e-commerce');
  });

  it('shows verbose param details when --verbose', async () => {
    vi.stubGlobal('fetch', manifestFetch(MANIFEST));

    const { log } = await captureOutput(() =>
      inspect('https://shop.com', mkOpts({ verbose: true })),
    );

    // Verbose mode shows individual param schemas
    expect(log).toContain('query');
    expect(log).toContain('string');
  });

  it('exits(1) and returns error JSON on 404 manifest (--json)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await expect(
      captureOutput(() => inspect('https://not-surf.com', mkOpts({ json: true }))),
    ).rejects.toThrow('process.exit(1)');
  });

  it('exits(1) on network error with error JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network timeout')));

    await expect(
      captureOutput(() => inspect('https://down.com', mkOpts({ json: true }))),
    ).rejects.toThrow('process.exit(1)');
  });

  it('shows "No commands defined" for empty commands', async () => {
    const emptyManifest: SurfManifest = { surf: '0.1.0', name: 'Empty', commands: {} };
    vi.stubGlobal('fetch', manifestFetch(emptyManifest));

    const { log } = await captureOutput(() =>
      inspect('https://empty.com', mkOpts({ json: false })),
    );

    expect(log).toContain('No commands defined');
  });
});

// ─── test command ─────────────────────────────────────────────────────────────

describe('test (cliTest)', () => {
  let exitSpy: ReturnType<typeof mockExit>;

  const MANIFEST: SurfManifest = {
    surf: '0.1.0',
    name: 'Acme Shop',
    version: '1.0.0',
    commands: {
      search: {
        description: 'Search products',
        params: {
          query: { type: 'string', required: true, description: 'Search query' },
          limit: { type: 'number', required: false, default: 10 },
        },
      },
      checkout: {
        description: 'Checkout cart',
        auth: 'required',
      },
      hiddenCmd: {
        description: 'Hidden command',
        auth: 'hidden',
      },
      openBrowser: {
        description: 'Browser-only command',
        hints: { execution: 'browser' as const },
      },
    },
  };

  function makeFetch(manifest: SurfManifest, executeResponse: unknown, executeStatus = 200) {
    let callCount = 0;
    return vi.fn().mockImplementation(async (url: string) => {
      callCount++;
      if ((url as string).includes('.well-known/surf.json')) {
        return {
          ok: true,
          status: 200,
          json: async () => manifest,
        };
      }
      // execute endpoint
      return {
        ok: executeStatus >= 200 && executeStatus < 300,
        status: executeStatus,
        json: async () => executeResponse,
      };
    });
  }

  beforeEach(() => {
    exitSpy = mockExit();
  });

  afterEach(() => {
    exitSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('exits(1) with error JSON when command not found', async () => {
    vi.stubGlobal('fetch', manifestFetch(MANIFEST));

    await expect(
      captureOutput(() =>
        cliTest('https://shop.com', 'nonExistent', mkOpts({ json: true })),
      ),
    ).rejects.toThrow('process.exit(1)');
  });

  it('error JSON mentions available commands when command not found', async () => {
    vi.stubGlobal('fetch', manifestFetch(MANIFEST));

    let captured = '';
    const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      captured += args.map(String).join(' ') + '\n';
    });
    exitSpy.mockImplementation((_?: string | number | null) => { throw new Error('exit'); });

    try {
      await cliTest('https://shop.com', 'nonExistent', mkOpts({ json: true }));
    } catch {
      // expected
    } finally {
      spy.mockRestore();
    }

    const parsed = JSON.parse(captured.trim());
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain('nonExistent');
  });

  it('exits(1) with error when browser-only command is tested', async () => {
    vi.stubGlobal('fetch', manifestFetch(MANIFEST));

    await expect(
      captureOutput(() =>
        cliTest('https://shop.com', 'openBrowser', mkOpts({ json: true })),
      ),
    ).rejects.toThrow('process.exit(1)');
  });

  it('exits(1) when auth-required command but no --auth token (--json)', async () => {
    vi.stubGlobal('fetch', manifestFetch(MANIFEST));

    await expect(
      captureOutput(() =>
        cliTest('https://shop.com', 'checkout', mkOpts({ json: true })),
      ),
    ).rejects.toThrow('process.exit(1)');
  });

  it('exits(1) when auth=hidden command but no --auth token (--json)', async () => {
    vi.stubGlobal('fetch', manifestFetch(MANIFEST));

    await expect(
      captureOutput(() =>
        cliTest('https://shop.com', 'hiddenCmd', mkOpts({ json: true })),
      ),
    ).rejects.toThrow('process.exit(1)');
  });

  it('exits(1) when required params missing in --json mode', async () => {
    vi.stubGlobal('fetch', manifestFetch(MANIFEST));

    await expect(
      captureOutput(() =>
        // 'search' requires 'query' — not provided
        cliTest('https://shop.com', 'search', mkOpts({ json: true })),
      ),
    ).rejects.toThrow('process.exit(1)');
  });

  it('missing required param error JSON lists missing keys', async () => {
    vi.stubGlobal('fetch', manifestFetch(MANIFEST));

    let captured = '';
    const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      captured += args.map(String).join(' ') + '\n';
    });
    exitSpy.mockImplementation((_?: string | number | null) => { throw new Error('exit'); });

    try {
      await cliTest('https://shop.com', 'search', mkOpts({ json: true }));
    } catch {
      // expected
    } finally {
      spy.mockRestore();
    }

    const parsed = JSON.parse(captured.trim());
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain('query');
  });

  it('applies defaults for optional params not provided', async () => {
    const fetchMock = makeFetch(MANIFEST, { ok: true, result: { items: [] } });
    vi.stubGlobal('fetch', fetchMock);

    const { log } = await captureOutput(() =>
      cliTest(
        'https://shop.com',
        'search',
        mkOpts({ json: true, params: { query: 'shoes' } }),
      ),
    );

    // Should reach execute; fetch called twice (manifest + execute)
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const parsed = JSON.parse(log);
    expect(parsed.ok).toBe(true);
  });

  it('returns successful execute response as JSON (--json)', async () => {
    const executeResult = { ok: true, result: { items: ['shoe1', 'shoe2'], total: 2 } };
    vi.stubGlobal('fetch', makeFetch(MANIFEST, executeResult));

    const { log } = await captureOutput(() =>
      cliTest(
        'https://shop.com',
        'search',
        mkOpts({ json: true, params: { query: 'shoes' } }),
      ),
    );

    const parsed = JSON.parse(log);
    expect(parsed.ok).toBe(true);
    expect(parsed.result.total).toBe(2);
  });

  it('shows human-readable OK output for successful command', async () => {
    const executeResult = { ok: true, result: { count: 5, items: ['a', 'b'] } };
    vi.stubGlobal('fetch', makeFetch(MANIFEST, executeResult));

    const { log } = await captureOutput(() =>
      cliTest(
        'https://shop.com',
        'search',
        mkOpts({ json: false, params: { query: 'shirts' } }),
      ),
    );

    expect(log).toContain('OK');
    expect(log).toContain('count');
  });

  it('uses basePath override instead of default /surf/execute', async () => {
    const fetchMock = makeFetch(MANIFEST, { ok: true, result: 'done' });
    vi.stubGlobal('fetch', fetchMock);

    await captureOutput(() =>
      cliTest(
        'https://shop.com',
        'search',
        mkOpts({ json: true, params: { query: 'test' }, basePath: '/api/surf/execute' }),
      ),
    );

    // The execute URL should use the override path
    const calls = fetchMock.mock.calls as Array<[string, unknown]>;
    const executeCall = calls.find(([url]) => !(url as string).includes('.well-known'));
    expect(executeCall?.[0]).toContain('/api/surf/execute');
  });

  it('exits(1) on execute HTTP error response (--json)', async () => {
    vi.stubGlobal('fetch', makeFetch(MANIFEST, { error: 'Server error' }, 500));

    await expect(
      captureOutput(() =>
        cliTest(
          'https://shop.com',
          'search',
          mkOpts({ json: true, params: { query: 'test' } }),
        ),
      ),
    ).rejects.toThrow('process.exit(1)');
  });

  it('coerces number params correctly before sending', async () => {
    const fetchMock = makeFetch(MANIFEST, { ok: true, result: [] });
    vi.stubGlobal('fetch', fetchMock);

    await captureOutput(() =>
      cliTest(
        'https://shop.com',
        'search',
        mkOpts({ json: true, params: { query: 'boots', limit: '5' } }),
      ),
    );

    // Check execute body has coerced number
    const calls = fetchMock.mock.calls as Array<[string, RequestInit]>;
    const executeCall = calls.find(([url]) => !(url as string).includes('.well-known'));
    const body = JSON.parse(executeCall?.[1]?.body as string) as {
      command: string;
      params: Record<string, unknown>;
    };
    expect(body.params.limit).toBe(5); // coerced to number
    expect(body.command).toBe('search');
  });

  it('exits(1) on manifest fetch failure (--json)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Timeout')));

    await expect(
      captureOutput(() =>
        cliTest('https://down.com', 'search', mkOpts({ json: true })),
      ),
    ).rejects.toThrow('process.exit(1)');
  });
});
