// ─── Manifest Types (mirrored from core for independence) ───────────────────

/**
 * Supported primitive types for command parameter schemas.
 *
 * Used in {@link ParamSchema} to declare the expected type of a command parameter.
 */
export type ParamType = 'string' | 'number' | 'boolean' | 'object' | 'array';

/**
 * Schema definition for a single command parameter.
 *
 * Describes the type, constraints, and documentation for a parameter
 * that appears in a Surf command's manifest entry.
 *
 * @example
 * ```ts
 * const schema: ParamSchema = {
 *   type: 'string',
 *   required: true,
 *   description: 'Search query text',
 *   enum: ['products', 'articles', 'all'],
 * };
 * ```
 */
export interface ParamSchema {
  /** The primitive type of this parameter. */
  type: ParamType;
  /** Whether this parameter is required. Default: `false`. */
  required?: boolean;
  /** Default value used when the parameter is omitted. */
  default?: unknown;
  /** Human-readable description of the parameter. */
  description?: string;
  /** Allowed values — constrains the parameter to this set. */
  enum?: readonly string[];
  /** Nested property schemas when `type` is `'object'`. */
  properties?: Record<string, ParamSchema>;
  /** Item schema when `type` is `'array'`. Can be inline or a `$ref`. */
  items?: ParamSchema | TypeRef;
}

/**
 * A JSON Schema–style `$ref` pointer to a shared type definition.
 *
 * Used in parameter schemas and return types to reference types declared
 * in the manifest's top-level `types` map.
 *
 * @example
 * ```ts
 * const ref: TypeRef = { $ref: '#/types/Product' };
 * ```
 */
export interface TypeRef {
  /** JSON pointer to a type definition, e.g. `'#/types/Product'`. */
  $ref: string;
}

/**
 * Execution hints for a command — helps agents decide how and when to call it.
 *
 * These are advisory; the server does not enforce them, but smart clients
 * and agent runtimes use them for caching, scheduling, and UX decisions.
 *
 * @example
 * ```ts
 * const hints: CommandHints = {
 *   idempotent: true,
 *   sideEffects: false,
 *   estimatedMs: 200,
 *   execution: 'server',
 * };
 * ```
 */
export interface CommandHints {
  /** Whether calling this command multiple times with the same params produces the same result. */
  idempotent?: boolean;
  /** Whether this command has side effects (writes data, sends emails, etc.). */
  sideEffects?: boolean;
  /** Estimated execution time in milliseconds — useful for agent timeout planning. */
  estimatedMs?: number;
  /** Where this command can be executed. `'any'` (default), `'browser'` (client-side only), or `'server'`. */
  execution?: 'any' | 'browser' | 'server';
}

/**
 * A concrete example of calling a command, shown to agents in the manifest.
 *
 * Examples improve agent accuracy by demonstrating expected input/output shapes.
 *
 * @example
 * ```ts
 * const example: CommandExample = {
 *   title: 'Search for shoes',
 *   params: { query: 'running shoes', limit: 5 },
 *   result: [{ id: '1', name: 'Air Max', price: 129 }],
 * };
 * ```
 */
export interface CommandExample {
  /** Human-readable label for this example. */
  title?: string;
  /** Example parameter values to pass to the command. */
  params: Record<string, unknown>;
  /** Expected result shape — helps agents understand the response format. */
  result?: unknown;
}

/**
 * A command definition as it appears in the Surf manifest.
 *
 * Each command represents a callable action on the Surf-enabled site.
 * The manifest exposes these to agents so they know what they can do.
 *
 * @example
 * ```ts
 * const cmd: ManifestCommand = {
 *   description: 'Search products by query string',
 *   params: {
 *     query: { type: 'string', required: true, description: 'Search text' },
 *     limit: { type: 'number', default: 10 },
 *   },
 *   returns: { $ref: '#/types/ProductList' },
 *   tags: ['search', 'products'],
 *   auth: 'optional',
 *   hints: { idempotent: true, sideEffects: false },
 * };
 * ```
 */
export interface ManifestCommand {
  /** Human-readable description of what this command does. */
  description: string;
  /** Parameter schemas — keys are param names. */
  params?: Record<string, ParamSchema>;
  /** Return type schema or a `$ref` to a shared type definition. */
  returns?: ParamSchema | TypeRef;
  /** Categorization tags for grouping and filtering commands. */
  tags?: string[];
  /** Authentication requirement: `'none'`, `'required'`, `'optional'`, `'hidden'`, or legacy boolean. */
  auth?: 'none' | 'required' | 'optional' | 'hidden' | boolean;
  /** Execution hints for agent decision-making. */
  hints?: CommandHints;
  /** Example request/response pairs — helps agents understand usage. */
  examples?: CommandExample[];
  /** Per-command rate limiting configuration. */
  rateLimit?: { windowMs: number; maxRequests: number };
  /** Whether this command supports pagination. */
  paginated?: boolean;
  /** Required auth scopes — token must have ALL listed scopes. */
  requiredScopes?: string[];
}

/**
 * Authentication configuration declared in the Surf manifest.
 *
 * Tells agents what kind of credentials the site expects.
 *
 * @example
 * ```ts
 * const auth: AuthConfig = {
 *   type: 'bearer',
 *   description: 'Pass a JWT token in the Authorization header',
 * };
 * ```
 */
export interface AuthConfig {
  /** Authentication mechanism type. */
  type: 'none' | 'bearer' | 'apiKey' | 'oauth2';
  /** Human-readable description of how to authenticate. */
  description?: string;
}

/**
 * Serialized representation of a real-time channel in the Surf manifest.
 *
 * Channels provide live state updates via Surf Live (WebSocket subscriptions).
 * Mirrors core's `ManifestChannel` for client-side independence.
 *
 * @example
 * ```ts
 * const channel: ManifestChannel = {
 *   description: 'Live inventory updates for a product',
 *   stateSchema: {
 *     stock: { type: 'number', description: 'Current stock count' },
 *     lastUpdated: { type: 'string', description: 'ISO timestamp of last change' },
 *   },
 * };
 * ```
 */
export interface ManifestChannel {
  /** Human-readable description of what this channel provides. */
  description: string;
  /** Schema describing the shape of state pushed on this channel. */
  stateSchema?: Record<string, ParamSchema | TypeRef>;
}

/**
 * A server-sent event definition in the Surf manifest.
 *
 * Events are fire-and-forget messages from the server to subscribed clients.
 *
 * @example
 * ```ts
 * const event: EventDefinition = {
 *   description: 'Fired when a new order is placed',
 *   data: {
 *     orderId: { type: 'string', required: true },
 *     total: { type: 'number' },
 *   },
 * };
 * ```
 */
export interface EventDefinition {
  /** Human-readable description of this event. */
  description: string;
  /** Schema for the event payload data. */
  data?: Record<string, ParamSchema | TypeRef>;
}

/**
 * A shared type definition declared at the manifest's top-level `types` map.
 *
 * Referenced by `$ref` pointers in parameter schemas and return types
 * to avoid repetition across commands.
 *
 * @example
 * ```ts
 * const productType: TypeDefinition = {
 *   type: 'object',
 *   description: 'A product listing',
 *   properties: {
 *     id: { type: 'string', required: true },
 *     name: { type: 'string', required: true },
 *     price: { type: 'number' },
 *   },
 * };
 * ```
 */
export interface TypeDefinition {
  /** The base type of this definition. */
  type: ParamType;
  /** Property schemas when `type` is `'object'`. */
  properties?: Record<string, ParamSchema | TypeRef>;
  /** Item schema when `type` is `'array'`. */
  items?: ParamSchema | TypeRef;
  /** Human-readable description of this type. */
  description?: string;
}

/**
 * The Surf manifest — the complete API surface of a Surf-enabled website.
 *
 * Discovered via `/.well-known/surf.json` or an HTML `<meta name="surf">` tag.
 * Contains all commands, types, events, channels, and auth configuration
 * that agents need to interact with the site.
 *
 * @example
 * ```ts
 * const manifest: SurfManifest = {
 *   surf: '1.0',
 *   name: 'My Store',
 *   description: 'E-commerce site with product search and checkout',
 *   commands: {
 *     search: { description: 'Search products', params: { query: { type: 'string', required: true } } },
 *   },
 *   checksum: 'sha256:abc123...',
 *   updatedAt: '2026-04-01T12:00:00Z',
 * };
 * ```
 */
export interface SurfManifest {
  /** Surf protocol version (e.g. `'1.0'`). */
  surf: string;
  /** Human-readable name of this Surf-enabled site. */
  name: string;
  /** Short description of the site. */
  description?: string;
  /** Longer human/agent-readable context about the site — what it does, what kind of content, editorial tone. */
  about?: string;
  /** Semantic version of the Surf integration. */
  version?: string;
  /** The canonical base URL of the Surf-enabled site. */
  baseUrl?: string;
  /** Authentication configuration. */
  auth?: AuthConfig;
  /** All available commands keyed by name. */
  commands: Record<string, ManifestCommand>;
  /** Server-sent event definitions. */
  events?: Record<string, EventDefinition>;
  /** Shared type definitions referenced by `$ref` pointers. */
  types?: Record<string, TypeDefinition>;
  /** Real-time channels available for subscription via Surf Live. */
  channels?: Record<string, ManifestChannel>;
  /** Deterministic SHA-256 hash of the commands schema — used for change detection. */
  checksum: string;
  /** ISO timestamp of when the Surf instance was last updated. */
  updatedAt: string;
}

/**
 * Result from {@link SurfClient.checkForUpdates}.
 *
 * Indicates whether the remote manifest has changed since the client was created.
 */
export interface UpdateCheckResult {
  /** `true` if the remote checksum differs from the local manifest. */
  changed: boolean;
  /** The checksum from the remote manifest. */
  checksum: string;
}

// ─── Response Types ─────────────────────────────────────────────────────────

/**
 * Server-side error codes returned in Surf error responses.
 *
 * These correspond to well-known failure conditions and appear in
 * `ErrorResponse.error.code`. Each code maps to an appropriate HTTP status:
 *
 * | Code | HTTP | Meaning |
 * |------|------|---------|
 * | `UNKNOWN_COMMAND` | 404 | Command name not found in manifest |
 * | `NOT_FOUND` | 404 | Requested resource does not exist |
 * | `INVALID_PARAMS` | 400 | Parameter validation failed |
 * | `AUTH_REQUIRED` | 401 | Command requires authentication |
 * | `AUTH_FAILED` | 401 | Provided credentials are invalid |
 * | `SESSION_EXPIRED` | 410 | Session no longer exists |
 * | `RATE_LIMITED` | 429 | Too many requests — retry later |
 * | `INTERNAL_ERROR` | 500 | Unexpected server failure |
 * | `NOT_SUPPORTED` | 501 | Command not supported in this context |
 */
export type SurfErrorCode =
  | 'UNKNOWN_COMMAND'
  | 'NOT_FOUND'
  | 'INVALID_PARAMS'
  | 'AUTH_REQUIRED'
  | 'AUTH_FAILED'
  | 'SESSION_EXPIRED'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'NOT_SUPPORTED';

/**
 * Exhaustive list of all valid {@link SurfErrorCode} values.
 *
 * Useful for runtime validation and iteration.
 *
 * @example
 * ```ts
 * if (SURF_ERROR_CODES.includes(code)) {
 *   // code is a valid SurfErrorCode
 * }
 * ```
 */
export const SURF_ERROR_CODES: readonly SurfErrorCode[] = [
  'UNKNOWN_COMMAND',
  'NOT_FOUND',
  'INVALID_PARAMS',
  'AUTH_REQUIRED',
  'AUTH_FAILED',
  'SESSION_EXPIRED',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'NOT_SUPPORTED',
] as const;

/**
 * Type guard that checks whether a string is a valid {@link SurfErrorCode}.
 *
 * @param code - The string to check.
 * @returns `true` if the code is a recognized Surf error code.
 *
 * @example
 * ```ts
 * const code = 'NOT_FOUND';
 * if (isSurfErrorCode(code)) {
 *   // code is narrowed to SurfErrorCode
 *   console.log('Server error:', code);
 * }
 * ```
 */
export function isSurfErrorCode(code: string): code is SurfErrorCode {
  return (SURF_ERROR_CODES as readonly string[]).includes(code);
}

/**
 * Client-side error codes thrown by the {@link SurfClient} SDK.
 *
 * Includes all server-side {@link SurfErrorCode} values plus additional
 * transport and protocol-level failure codes:
 *
 * | Code | Meaning |
 * |------|---------|
 * | `NETWORK_ERROR` | Network-level failure (WebSocket closed, HTTP error, fetch failed) |
 * | `TIMEOUT` | Request or discovery timed out |
 * | `NOT_CONNECTED` | Transport not connected — call `connect()` first |
 * | `INVALID_MANIFEST` | Manifest response was invalid or missing required fields |
 * | `MAX_RETRIES` | All retry attempts exhausted |
 * | `HTTP_ERROR` | Non-OK HTTP response from a raw HTTP request (e.g. pipeline) |
 */
export type SurfClientErrorCode =
  | SurfErrorCode
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'NOT_CONNECTED'
  | 'INVALID_MANIFEST'
  | 'MAX_RETRIES'
  | 'HTTP_ERROR';

/**
 * A successful command execution response from the Surf server.
 */
export interface ExecuteResponse {
  /** Always `true` for success responses. */
  ok: true;
  /** Optional request correlation ID (echoed from the request). */
  requestId?: string;
  /** The command result payload. */
  result: unknown;
  /** Updated session state (only present in session-scoped requests). */
  state?: Record<string, unknown>;
  /** Session ID (only present when a session is active). */
  sessionId?: string;
}

/**
 * An error response from the Surf server.
 */
export interface ErrorResponse {
  /** Always `false` for error responses. */
  ok: false;
  /** Optional request correlation ID (echoed from the request). */
  requestId?: string;
  /** Error details including machine-readable code and human-readable message. */
  error: {
    /** Machine-readable error code. */
    code: SurfErrorCode;
    /** Human-readable error description. */
    message: string;
    /** Optional additional context (e.g. `retryAfterMs` for rate limiting). */
    details?: Record<string, unknown>;
  };
}

/**
 * Discriminated union of all possible Surf server responses.
 *
 * Check `response.ok` to narrow:
 *
 * @example
 * ```ts
 * const response: SurfResponse = await transport.execute('search', { query: 'shoes' });
 * if (response.ok) {
 *   console.log(response.result); // ExecuteResponse
 * } else {
 *   console.error(response.error.code); // ErrorResponse
 * }
 * ```
 */
export type SurfResponse = ExecuteResponse | ErrorResponse;

// ─── Client Options ─────────────────────────────────────────────────────────

/**
 * Configuration for automatic request retries on transient failures.
 *
 * When set on {@link SurfClientOptions.retry}, the client automatically retries
 * failed requests using exponential backoff with jitter.
 *
 * @example
 * ```ts
 * const retry: RetryConfig = {
 *   maxAttempts: 3,
 *   backoffMs: 500,
 *   backoffMultiplier: 2,
 *   retryOn: [429, 502, 503, 504],
 * };
 * ```
 */
export interface RetryConfig {
  /** Maximum number of attempts (including the initial request). */
  maxAttempts: number;
  /** Initial backoff delay in milliseconds before the first retry. */
  backoffMs: number;
  /** Multiplier applied to backoff delay after each attempt. */
  backoffMultiplier: number;
  /** HTTP status codes to retry on. Default: `[429, 502, 503, 504]`. */
  retryOn?: number[];
}

/**
 * Configuration for the client-side response cache.
 *
 * Caches successful responses for commands without side effects.
 * Uses LRU eviction when the cache reaches `maxSize`.
 *
 * @example
 * ```ts
 * const cache: CacheConfig = {
 *   ttlMs: 30_000, // 30 seconds
 *   maxSize: 100,
 * };
 * ```
 */
export interface CacheConfig {
  /** Cache TTL in milliseconds. Entries older than this are evicted on access. */
  ttlMs: number;
  /** Maximum number of cached entries. Oldest (LRU) entry is evicted when full. */
  maxSize: number;
}

/**
 * A map of command names to their typed parameter and result shapes.
 *
 * Used as a generic constraint for {@link TypedClient} to provide
 * end-to-end type safety when executing commands.
 *
 * @example
 * ```ts
 * interface MyCommands extends TypedCommands {
 *   search: { params: { query: string; limit?: number }; result: Product[] };
 *   getProduct: { params: { id: string }; result: Product };
 * }
 * ```
 */
export type TypedCommands = Record<string, { params: Record<string, unknown>; result: unknown }>;

/**
 * A typed proxy client where each property is an async function matching
 * the command's parameter and return types.
 *
 * Created via {@link SurfClient.typed}.
 *
 * @example
 * ```ts
 * const typed: TypedClient<MyCommands> = client.typed<MyCommands>();
 * const products = await typed.search({ query: 'shoes' }); // Product[]
 * const product = await typed.getProduct({ id: '123' });   // Product
 * ```
 */
export type TypedClient<T extends TypedCommands> = {
  [K in keyof T]: (params: T[K]['params']) => Promise<T[K]['result']>;
};

/**
 * A single step in a pipeline request.
 *
 * Pipelines execute multiple commands in a single HTTP round-trip.
 *
 * @example
 * ```ts
 * const steps: PipelineStep[] = [
 *   { command: 'getUser', params: { id: '1' }, as: 'user' },
 *   { command: 'getOrders', params: { userId: '1' }, as: 'orders' },
 * ];
 * ```
 */
export interface PipelineStep {
  /** The command name to execute. */
  command: string;
  /** Parameters to pass to the command. */
  params?: Record<string, unknown>;
  /** Alias for this step's result — used for referencing in later steps. */
  as?: string;
}

/**
 * The result of a single pipeline step.
 */
export interface PipelineStepResult {
  /** The command that was executed. */
  command: string;
  /** Whether this step succeeded. */
  ok: boolean;
  /** The command result (present when `ok` is `true`). */
  result?: unknown;
  /** Error details (present when `ok` is `false`). */
  error?: { code: string; message: string };
}

/**
 * The response from a pipeline request containing results for all steps.
 *
 * @example
 * ```ts
 * const response = await client.pipeline([
 *   { command: 'getUser', params: { id: '1' } },
 *   { command: 'getOrders', params: { userId: '1' } },
 * ]);
 * if (response.ok) {
 *   const [userResult, ordersResult] = response.results;
 * }
 * ```
 */
export interface PipelineResponse {
  /** `true` if all steps succeeded; `false` if any step failed. */
  ok: boolean;
  /** Per-step results in the same order as the input steps. */
  results: PipelineStepResult[];
}

/**
 * Options for creating a {@link SurfClient}.
 *
 * @example
 * ```ts
 * const options: SurfClientOptions = {
 *   baseUrl: 'https://example.com',
 *   auth: 'my-api-token',
 *   retry: { maxAttempts: 3, backoffMs: 500, backoffMultiplier: 2 },
 *   cache: { ttlMs: 30_000, maxSize: 100 },
 * };
 * const client = SurfClient.fromManifest(manifest, options);
 * ```
 */
export interface SurfClientOptions {
  /** Base URL of the Surf-enabled site (e.g. `'https://example.com'`). */
  baseUrl: string;
  /** Pre-loaded manifest (skips discovery). */
  manifest?: SurfManifest;
  /** Auth token for authenticated commands (sent as `Bearer` header). */
  auth?: string;
  /** Custom `fetch` implementation (defaults to `globalThis.fetch`). */
  fetch?: typeof globalThis.fetch;
  /** Retry configuration for transient failures. */
  retry?: RetryConfig;
  /** Response cache configuration for read-only commands. */
  cache?: CacheConfig;
  /** Timeout for manifest discovery in milliseconds. Default: `5000`. */
  discoverTimeout?: number;
  /**
   * Base path for the Surf execute endpoint. Default: `'/surf/execute'`.
   *
   * Override to `'/api/surf/execute'` when using `@surfjs/next` with App Router.
   *
   * @example '/api/surf/execute'
   */
  basePath?: string;
}

/**
 * A stateful session for multi-step interactions with a Surf server.
 *
 * Sessions maintain server-side state across multiple command executions,
 * enabling workflows like shopping carts, wizards, and multi-step forms.
 *
 * @example
 * ```ts
 * const session = await client.startSession();
 * await session.execute('addToCart', { productId: '123', quantity: 2 });
 * console.log(session.state); // { cartItems: 2 }
 * await session.execute('checkout');
 * await session.end();
 * ```
 */
export interface SurfSession {
  /** Unique session identifier assigned by the server. */
  readonly id: string;
  /** Current accumulated session state (updated after each execution). */
  readonly state: Record<string, unknown>;
  /**
   * Execute a command within this session.
   *
   * @param command - The command name to execute.
   * @param params - Optional parameters for the command.
   * @returns The command result.
   * @throws {@link SurfClientError} on transport or application errors.
   */
  execute(command: string, params?: Record<string, unknown>): Promise<unknown>;
  /**
   * End the session and release server-side resources.
   */
  end(): Promise<void>;
}

// ─── WebSocket Message Types ────────────────────────────────────────────────

/**
 * A command result message received over the WebSocket transport.
 *
 * Correlates to a previously sent `execute` message via the `id` field.
 */
export interface WsResultMessage {
  /** Message type discriminator. */
  type: 'result';
  /** Correlation ID matching the original execute request. */
  id: string;
  /** Whether the command succeeded. */
  ok: boolean;
  /** Command result payload (present when `ok` is `true`). */
  result?: unknown;
  /** Updated session state (present in session-scoped requests). */
  state?: Record<string, unknown>;
  /** Error details (present when `ok` is `false`). */
  error?: {
    code: SurfErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * A server-sent event message received over the WebSocket transport.
 *
 * Events are push notifications from the server — subscribe with
 * {@link WebSocketTransport.on}.
 */
export interface WsEventMessage {
  /** Message type discriminator. */
  type: 'event';
  /** The event name (matches an entry in `SurfManifest.events`). */
  event: string;
  /** Event payload data. */
  data: unknown;
}

/**
 * Discriminated union of all incoming WebSocket messages.
 *
 * Use the `type` field to narrow: `'result'` for command responses,
 * `'event'` for server-sent events.
 */
export type WsIncomingMessage = WsResultMessage | WsEventMessage;
