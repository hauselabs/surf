import type {
  SurfManifest,
  ManifestCommand,
  SurfClientOptions,
  SurfSession,
  UpdateCheckResult,
  RetryConfig,
  CacheConfig,
  TypedCommands,
  TypedClient,
  PipelineStep,
  PipelineResponse,
  SurfClientErrorCode,
} from './types.js';
import { discoverManifest } from './discovery.js';
import { HttpTransport } from './transport/http.js';
import { WebSocketTransport } from './transport/websocket.js';

// ─── SurfClientError ─────────────────────────────────────────────────────────

/**
 * Error thrown by the SurfClient SDK for transport, connection, and protocol failures.
 * The `code` property carries a machine-readable `SurfClientErrorCode` for programmatic handling.
 *
 * @example
 * ```ts
 * try {
 *   await client.execute('search', { query: 'shoes' });
 * } catch (e) {
 *   if (e instanceof SurfClientError) {
 *     if (e.code === 'RATE_LIMITED') console.log(`Retry in ${e.retryAfter}s`);
 *     if (e.code === 'NOT_CONNECTED') await client.connect();
 *   }
 * }
 * ```
 */
export class SurfClientError extends Error {
  readonly code: SurfClientErrorCode;
  readonly statusCode?: number;
  readonly retryAfter?: number;

  constructor(message: string, code: SurfClientErrorCode, statusCode?: number, retryAfter?: number) {
    super(message);
    this.name = 'SurfClientError';
    this.code = code;
    this.statusCode = statusCode;
    this.retryAfter = retryAfter;
  }
}

// ─── Cache ────────────────────────────────────────────────────────────────────

interface CacheEntry {
  result: unknown;
  expiresAt: number;
}

class ResponseCache {
  private readonly store = new Map<string, CacheEntry>();
  private readonly config: CacheConfig;

  constructor(config: CacheConfig) {
    this.config = config;
  }

  private key(command: string, params?: Record<string, unknown>): string {
    const sorted = params
      ? Object.fromEntries(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)))
      : {};
    return `${command}:${JSON.stringify(sorted)}`;
  }

  get(command: string, params?: Record<string, unknown>): unknown | undefined {
    const k = this.key(command, params);
    const entry = this.store.get(k);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(k);
      return undefined;
    }
    // LRU promotion: move to end of Map so it's evicted last
    this.store.delete(k);
    this.store.set(k, entry);
    return entry.result;
  }

  set(command: string, params: Record<string, unknown> | undefined, result: unknown): void {
    if (this.store.size >= this.config.maxSize) {
      // Evict oldest entry
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) this.store.delete(firstKey);
    }
    this.key(command, params);
    this.store.set(this.key(command, params), {
      result,
      expiresAt: Date.now() + this.config.ttlMs,
    });
  }

  clear(command?: string): void {
    if (command) {
      for (const k of this.store.keys()) {
        if (k.startsWith(`${command}:`)) this.store.delete(k);
      }
    } else {
      this.store.clear();
    }
  }
}

// ─── Retry helper ─────────────────────────────────────────────────────────────

const DEFAULT_RETRY: RetryConfig = {
  maxAttempts: 3,
  backoffMs: 500,
  backoffMultiplier: 2,
  retryOn: [429, 502, 503, 504],
};

/** Error codes that indicate permanent failures — never retry these. */
const PERMANENT_ERROR_CODES = new Set([
  'UNKNOWN_COMMAND',
  'INVALID_PARAMS',
  'AUTH_REQUIRED',
  'AUTH_FAILED',
  'FORBIDDEN',
  'NOT_FOUND',
]);

async function withRetry<T>(
  fn: () => Promise<{ value: T; statusCode?: number; retryAfter?: number }>,
  config: RetryConfig,
): Promise<T> {
  const retryCodes = config.retryOn ?? DEFAULT_RETRY.retryOn!;
  let lastError: unknown;

  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      const { value, statusCode, retryAfter } = await fn();

      if (statusCode && retryCodes.includes(statusCode) && attempt < config.maxAttempts - 1) {
        const delay = retryAfter
          ? retryAfter * 1000
          : config.backoffMs * Math.pow(config.backoffMultiplier, attempt) + Math.random() * 100;
        await sleep(delay);
        continue;
      }

      return value;
    } catch (e) {
      lastError = e;

      // Never retry permanent application errors
      if (e instanceof SurfClientError && PERMANENT_ERROR_CODES.has(e.code)) {
        throw e;
      }

      if (attempt < config.maxAttempts - 1) {
        const delay = config.backoffMs * Math.pow(config.backoffMultiplier, attempt) + Math.random() * 100;
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new SurfClientError('Max retry attempts exceeded', 'MAX_RETRIES');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── SurfClient ───────────────────────────────────────────────────────────────

/**
 * SurfClient — the agent-side SDK for interacting with Surf-enabled websites.
 *
 * Provides HTTP command execution, WebSocket real-time communication,
 * stateful sessions, pipelines, response caching, automatic retries,
 * and typed command proxies.
 *
 * Create a client via discovery (recommended) or from a pre-loaded manifest:
 *
 * @example
 * ```ts
 * // Auto-discover manifest from the site
 * const client = await SurfClient.discover('https://example.com');
 * const result = await client.execute('search', { query: 'shoes' });
 *
 * // Or with a pre-loaded manifest
 * const client = SurfClient.fromManifest(manifest, { baseUrl: 'https://example.com' });
 * ```
 *
 * @example
 * ```ts
 * // With retry and caching
 * const client = await SurfClient.discover('https://example.com', {
 *   retry: { maxAttempts: 3, backoffMs: 500, backoffMultiplier: 2 },
 *   cache: { ttlMs: 30_000, maxSize: 100 },
 * });
 * ```
 */
/** Default base path — matches the built-in core middleware mount point. */
const DEFAULT_BASE_PATH = '/surf';

export class SurfClient {
  readonly manifest: SurfManifest;
  private readonly http: HttpTransport;
  private readonly baseUrl: string;
  private auth?: string;
  private readonly retryConfig?: RetryConfig;
  private readonly cache?: ResponseCache;
  private readonly surfBasePath: string;
  private ws: WebSocketTransport | null = null;

  private constructor(manifest: SurfManifest, options: SurfClientOptions) {
    this.manifest = manifest;
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.auth = options.auth;
    this.retryConfig = options.retry;
    // Normalise: strip trailing slash, ensure leading slash
    const rawBasePath = options.basePath ?? `${DEFAULT_BASE_PATH}/execute`;
    this.surfBasePath = rawBasePath.startsWith('/') ? rawBasePath : `/${rawBasePath}`;
    if (options.cache) {
      this.cache = new ResponseCache(options.cache);
    }
    this.http = new HttpTransport({
      baseUrl: this.baseUrl,
      auth: options.auth,
      fetch: options.fetch ?? globalThis.fetch,
      basePath: this.surfBasePath,
    });
  }

  /**
   * Discover and connect to a Surf-enabled site.
   *
   * Fetches the Surf manifest from `/.well-known/surf.json` (with HTML meta tag fallback),
   * then creates a fully configured client instance.
   *
   * @param url - The base URL of the Surf-enabled site.
   * @param options - Optional client configuration (auth, retry, cache, etc.).
   * @returns A connected `SurfClient` with the discovered manifest.
   * @throws {@link SurfClientError} if manifest discovery fails.
   *
   * @example
   * ```ts
   * const client = await SurfClient.discover('https://example.com', {
   *   auth: 'my-token',
   *   cache: { ttlMs: 60_000, maxSize: 50 },
   * });
   * ```
   */
  static async discover(
    url: string,
    options?: Partial<SurfClientOptions>,
  ): Promise<SurfClient> {
    const baseUrl = url.replace(/\/$/, '');
    const fetchFn = options?.fetch ?? globalThis.fetch;
    const timeout = options?.discoverTimeout ?? 5000;
    const manifest = await discoverManifest(baseUrl, fetchFn, timeout, options?.auth);
    return new SurfClient(manifest, { baseUrl, ...options, fetch: fetchFn });
  }

  /**
   * Create a client with a pre-loaded manifest, skipping discovery.
   *
   * Use this when you already have the manifest (e.g. from a build step,
   * a cache, or a bundled configuration).
   *
   * @param manifest - The pre-loaded Surf manifest.
   * @param options - Client configuration including `baseUrl`.
   * @returns A configured `SurfClient` instance.
   *
   * @example
   * ```ts
   * const client = SurfClient.fromManifest(manifest, {
   *   baseUrl: 'https://example.com',
   *   auth: 'my-token',
   * });
   * ```
   */
  static fromManifest(manifest: SurfManifest, options: SurfClientOptions): SurfClient {
    return new SurfClient(manifest, options);
  }

  /**
   * All available commands from the manifest, keyed by name.
   *
   * @example
   * ```ts
   * for (const [name, cmd] of Object.entries(client.commands)) {
   *   console.log(`${name}: ${cmd.description}`);
   * }
   * ```
   */
  get commands(): Record<string, ManifestCommand> {
    return this.manifest.commands;
  }

  /**
   * Get a specific command definition by name.
   *
   * @param name - The command name to look up.
   * @returns The command definition, or `undefined` if not found.
   *
   * @example
   * ```ts
   * const searchCmd = client.command('search');
   * if (searchCmd) {
   *   console.log(searchCmd.description);
   *   console.log(searchCmd.params);
   * }
   * ```
   */
  command(name: string): ManifestCommand | undefined {
    return this.manifest.commands[name];
  }

  /**
   * Update the auth token at runtime.
   *
   * Useful for OAuth2 token rotation — the new token is used for all
   * subsequent HTTP requests and WebSocket messages without reconnecting.
   */
  setAuth(token: string | undefined): void {
    this.auth = token;
    this.http.setAuth(token);
  }

  /**
   * Execute a command via HTTP transport.
   *
   * Automatically applies response caching (for commands without side effects)
   * and retries (for transient failures) when configured.
   *
   * @param command - The command name to execute.
   * @param params - Optional parameters for the command.
   * @returns The command result.
   * @throws {@link SurfClientError} on transport or application errors.
   *
   * @example
   * ```ts
   * const results = await client.execute('search', { query: 'shoes', limit: 10 });
   * ```
   */
  async execute(command: string, params?: Record<string, unknown>): Promise<unknown> {
    // Check cache (skip if command has side effects)
    const cmdDef = this.manifest.commands[command];
    const hasSideEffects = cmdDef?.hints?.sideEffects === true;

    if (this.cache && !hasSideEffects) {
      const cached = this.cache.get(command, params);
      if (cached !== undefined) return cached;
    }

    const doExecute = async () => {
      const response = await this.http.execute(command, params);
      if (!response.ok) {
        const retryAfter = response.error.details?.['retryAfterMs'] as number | undefined;
        throw new SurfClientError(
          `Surf error [${response.error.code}]: ${response.error.message}`,
          response.error.code,
          undefined,
          retryAfter ? Math.ceil(retryAfter / 1000) : undefined,
        );
      }
      return { value: response.result, statusCode: 200 };
    };

    let result: unknown;
    if (this.retryConfig) {
      result = await withRetry(doExecute, this.retryConfig);
    } else {
      const { value } = await doExecute();
      result = value;
    }

    if (this.cache && !hasSideEffects) {
      this.cache.set(command, params, result);
    }

    return result;
  }

  /**
   * Clear the response cache.
   *
   * @param command - If provided, only clear cached entries for this command.
   *                  If omitted, clears the entire cache.
   *
   * @example
   * ```ts
   * client.clearCache('search');  // Clear only search results
   * client.clearCache();          // Clear everything
   * ```
   */
  clearCache(command?: string): void {
    this.cache?.clear(command);
  }

  /**
   * Execute multiple commands in a pipeline — a single HTTP round-trip.
   *
   * Pipelines are more efficient than sequential `execute()` calls when
   * you need results from multiple independent commands.
   *
   * @param steps - The pipeline steps to execute in order.
   * @param options - Optional pipeline configuration.
   * @param options.sessionId - Session ID to scope all steps to.
   * @param options.continueOnError - If `true`, continue executing remaining steps
   *                                   even if a step fails. Default: `false`.
   * @returns A {@link PipelineResponse} with per-step results.
   * @throws {@link SurfClientError} if the pipeline request itself fails.
   *
   * @example
   * ```ts
   * const response = await client.pipeline([
   *   { command: 'getUser', params: { id: '1' }, as: 'user' },
   *   { command: 'getOrders', params: { userId: '1' } },
   * ], { continueOnError: true });
   *
   * for (const step of response.results) {
   *   console.log(step.command, step.ok ? step.result : step.error);
   * }
   * ```
   */
  async pipeline(steps: PipelineStep[], options?: { sessionId?: string; continueOnError?: boolean }): Promise<PipelineResponse> {
    // Derive pipeline URL from the configured execute path (replace /execute → /pipeline)
    const pipelinePath = this.surfBasePath.replace(/\/execute$/, '/pipeline');
    const url = `${this.baseUrl}${pipelinePath}`;
    const fetchFn = this.http.getFetch();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.auth) headers['Authorization'] = `Bearer ${this.auth}`;

    const response = await fetchFn(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ steps, ...options }),
    });

    if (!response.ok) {
      throw new SurfClientError(
        `Pipeline request failed: ${response.status} ${response.statusText}`,
        'HTTP_ERROR',
        response.status,
      );
    }

    return response.json() as Promise<PipelineResponse>;
  }

  /**
   * Returns a typed proxy where each property is a typed command executor.
   *
   * @example
   * ```ts
   * const typed = client.typed<{ search: { params: { query: string }; result: Product[] } }>();
   * const results = await typed.search({ query: 'shoes' }); // → Product[]
   * ```
   */
  typed<T extends TypedCommands>(): TypedClient<T> {
    return new Proxy({} as TypedClient<T>, {
      get: (_target, prop: string) => {
        return (params: Record<string, unknown>) => this.execute(prop, params) as Promise<T[typeof prop]['result']>;
      },
    });
  }

  /**
   * Re-fetch the manifest and check if the remote version has changed.
   *
   * Compares the remote checksum against the local manifest's checksum.
   * If changed, the new manifest is included in the response.
   *
   * @returns An {@link UpdateCheckResult} with `changed` flag and optional new manifest.
   *
   * @example
   * ```ts
   * const update = await client.checkForUpdates();
   * if (update.changed && update.manifest) {
   *   console.log('Manifest updated! New commands:', Object.keys(update.manifest.commands));
   * }
   * ```
   */
  async checkForUpdates(): Promise<UpdateCheckResult & { manifest?: SurfManifest }> {
    const fetchFn = this.http.getFetch();
    try {
      const fresh = await discoverManifest(this.baseUrl, fetchFn, undefined, this.auth);
      const changed = fresh.checksum !== this.manifest.checksum;
      return { changed, checksum: fresh.checksum, ...(changed ? { manifest: fresh } : {}) };
    } catch {
      return { changed: false, checksum: this.manifest.checksum };
    }
  }

  /**
   * Connect via WebSocket for real-time command execution and event streaming.
   *
   * Establishes a WebSocket connection to the Surf server's `/surf/ws` endpoint.
   * The returned transport supports `execute()`, `on()` for events, and session management.
   *
   * @returns A connected {@link WebSocketTransport} instance.
   * @throws {@link SurfClientError} if the WebSocket connection fails.
   *
   * @example
   * ```ts
   * const ws = await client.connect();
   * ws.on('priceUpdate', (data) => console.log('New price:', data));
   * const result = await ws.execute('subscribe', { channel: 'prices' });
   * ```
   */
  async connect(): Promise<WebSocketTransport> {
    const wsUrl = this.baseUrl.replace(/^http/, 'ws').concat('/surf/ws');
    const transport = new WebSocketTransport();
    await transport.connect(wsUrl, this.auth);
    this.ws = transport;
    return transport;
  }

  /**
   * Start a stateful session for multi-step interactions.
   *
   * Sessions maintain server-side state across commands — useful for
   * shopping carts, wizards, and transactional workflows.
   *
   * @returns A {@link SurfSession} with `execute()` and `end()` methods.
   * @throws {@link SurfClientError} if session creation fails.
   *
   * @example
   * ```ts
   * const session = await client.startSession();
   * await session.execute('addToCart', { productId: '123', quantity: 2 });
   * console.log(session.state); // { cartItems: 2, total: 258 }
   * await session.execute('checkout');
   * await session.end();
   * ```
   */
  async startSession(): Promise<SurfSession> {
    const sessionId = await this.http.startSession();
    let currentState: Record<string, unknown> = {};

    const session: SurfSession = {
      get id() { return sessionId; },
      get state() { return currentState; },

      execute: async (command: string, params?: Record<string, unknown>): Promise<unknown> => {
        const response = await this.http.execute(command, params, sessionId);
        if (!response.ok) {
          throw new SurfClientError(
            `Surf error [${response.error.code}]: ${response.error.message}`,
            response.error.code,
          );
        }
        if (response.state) currentState = response.state;
        return response.result;
      },

      end: async (): Promise<void> => {
        await this.http.endSession(sessionId);
      },
    };

    return session;
  }

  /**
   * Disconnect the WebSocket transport if connected.
   *
   * This is a no-op if no WebSocket connection is active.
   * Stops reconnection attempts and closes the underlying socket.
   */
  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}
