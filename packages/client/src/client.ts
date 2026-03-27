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
 * @example
 * ```ts
 * const client = await SurfClient.discover('https://example.com');
 * const result = await client.execute('search', { query: 'shoes' });
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
   * Create a client with a pre-loaded manifest (skip discovery).
   */
  static fromManifest(manifest: SurfManifest, options: SurfClientOptions): SurfClient {
    return new SurfClient(manifest, options);
  }

  /** List all available commands (as property). */
  get commands(): Record<string, ManifestCommand> {
    return this.manifest.commands;
  }

  /** Get a specific command definition. */
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
   * Execute a command via HTTP.
   * Respects retry config and cache if configured.
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
   * Clear the response cache. Optionally for a specific command only.
   */
  clearCache(command?: string): void {
    this.cache?.clear(command);
  }

  /**
   * Execute multiple commands in a pipeline (single round-trip).
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
   * Re-fetch the manifest and check if the checksum has changed.
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
   * Connect via WebSocket for real-time interaction.
   */
  async connect(): Promise<WebSocketTransport> {
    const wsUrl = this.baseUrl.replace(/^http/, 'ws').concat('/surf/ws');
    const transport = new WebSocketTransport();
    await transport.connect(wsUrl, this.auth);
    this.ws = transport;
    return transport;
  }

  /**
   * Start a stateful session.
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

  /** Disconnect WebSocket if connected. */
  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}
