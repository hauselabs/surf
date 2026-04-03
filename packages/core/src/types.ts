// ─── Parameter Types ────────────────────────────────────────────────────────

/** Supported parameter types for command params and return schemas. */
export type ParamType = 'string' | 'number' | 'boolean' | 'object' | 'array';

/**
 * Schema definition for a single command parameter.
 * Used to validate incoming params and generate manifest documentation.
 */
export interface ParamSchema {
  /** The expected type of this parameter. */
  type: ParamType;
  /** Whether this parameter must be provided. Defaults to `false`. */
  required?: boolean;
  /** Default value used when the parameter is omitted. */
  default?: unknown;
  /** Human-readable description of this parameter (included in manifest). */
  description?: string;
  /** Restrict allowed values for string parameters. */
  enum?: readonly string[];
  /** Nested property schemas for object-typed parameters. */
  properties?: Record<string, ParamSchema>;
  /** Item schema for array-typed parameters. */
  items?: ParamSchema | TypeRef;
}

/** JSON Schema-style `$ref` reference to a type defined in `SurfConfig.types`. */
export interface TypeRef {
  $ref: string;
}

/** Reusable type definition declared in `SurfConfig.types`. */
export interface TypeDefinition {
  /** The base type of this definition. */
  type: ParamType;
  /** Property schemas for object-typed definitions. */
  properties?: Record<string, ParamSchema | TypeRef>;
  /** Item schema for array-typed definitions. */
  items?: ParamSchema | TypeRef;
  /** Human-readable description of this type. */
  description?: string;
}

// ─── Command Types ──────────────────────────────────────────────────────────

/**
 * Optional hints that help agents decide how to use a command.
 * Included in the manifest for agent planning/optimization.
 */
export interface CommandHints {
  /** Whether the command is safe to retry (same params → same result). */
  idempotent?: boolean;
  /** Whether the command modifies server state. `false` = read-only. */
  sideEffects?: boolean;
  /** Estimated execution time in milliseconds — helps agents budget latency. */
  estimatedMs?: number;
  /** Where this command can be executed. `'any'` (default), `'browser'` (client-side only via window.surf), or `'server'`. */
  execution?: 'any' | 'browser' | 'server';
}

/**
 * Context passed to every command handler at execution time.
 * Populated by the transport layer and middleware pipeline.
 */
export interface ExecutionContext {
  /** Active session ID, if the request is part of a stateful session. */
  sessionId?: string;
  /** Raw auth token extracted from the request (e.g. Bearer token). */
  auth?: string;
  /** Session state — mutable, persisted between requests in the same session. */
  state?: Record<string, unknown>;
  /** Client-provided request ID for correlation. */
  requestId?: string;
  /** Verified auth claims (populated by auth middleware). */
  claims?: Record<string, unknown>;
  /** Auth scopes granted to this request (populated by auth middleware). */
  scopes?: string[];
  /** Client IP address (populated by HTTP transport). */
  ip?: string;
  /** Emit a streaming chunk (only available for streaming commands). */
  emit?: (data: unknown) => void;
}

/**
 * The function that executes a command's logic.
 * Receives validated params and an execution context.
 */
export type CommandHandler<TParams = Record<string, unknown>, TResult = unknown> = (
  params: TParams,
  context: ExecutionContext,
) => TResult | Promise<TResult>;

/**
 * Rate limiting configuration — applied globally or per-command.
 */
export interface RateLimitConfig {
  /** Time window in milliseconds. */
  windowMs: number;
  /** Maximum requests per window. */
  maxRequests: number;
  /** Key to group rate limits by. Default: `'ip'`. */
  keyBy?: 'ip' | 'session' | 'auth' | 'global';
}

/**
 * Defines a single command — its schema, behavior hints, and handler.
 * This is the primary building block of a Surf-enabled API.
 */
export interface CommandDefinition<TParams = Record<string, unknown>, TResult = unknown> {
  /** Human-readable description of what this command does (shown to agents). */
  description: string;
  params?: Record<string, ParamSchema>;
  returns?: ParamSchema | TypeRef;
  tags?: string[];
  auth?: 'none' | 'required' | 'optional' | 'hidden' | boolean;
  hints?: CommandHints;
  /** Enable SSE streaming for this command. */
  stream?: boolean;
  /** Per-command rate limiting. */
  rateLimit?: RateLimitConfig;
  /** Example request/response pairs shown in manifest — dramatically improves agent accuracy. */
  examples?: CommandExample[];
  /** Enable pagination for this command. `true` uses defaults; object configures behavior. */
  paginated?: boolean | PaginationConfig;
  /** Required auth scopes. Token must have ALL listed scopes. Only checked when auth is 'required' or 'optional' (with token). */
  requiredScopes?: string[];
  /** Reject requests that include params not defined in the command schema. Overrides the global `strictParams` setting. */
  strictParams?: boolean;
  run: CommandHandler<TParams, TResult>;
}

/** A concrete example of calling a command, shown to agents in the manifest. */
export interface CommandExample {
  /** Human-readable label for this example. */
  title?: string;
  params: Record<string, unknown>;
  result?: unknown;
}

/**
 * A recursive group of commands for dot-notation namespacing.
 * Optionally includes a `_description` for the namespace itself.
 */
export interface CommandGroup {
  /** Description of this namespace group (shown to agents). Use the key `_description`. */
  _description?: string;
  [key: string]: CommandDefinition | CommandGroup | string | undefined;
}

// ─── Pagination Types ────────────────────────────────────────────────────────

/** Standard pagination parameters accepted by paginated commands. */
export interface PaginatedParams {
  /** Opaque cursor from a previous response's `nextCursor`. */
  cursor?: string;
  /** Maximum number of items to return. */
  limit?: number;
  /** Zero-based offset for offset-style pagination. */
  offset?: number;
}

/** Standard response envelope for paginated commands. */
export interface PaginatedResult<T = unknown> {
  /** The page of results. */
  items: T[];
  /** Opaque cursor for the next page. `null` or absent means last page. */
  nextCursor?: string | null;
  /** Whether more results exist beyond this page. */
  hasMore: boolean;
  /** Total number of items across all pages (if known). */
  total?: number;
}

/** Configuration for pagination behavior on a command. */
export interface PaginationConfig {
  /** Default page size when `limit` is omitted. Default: `20`. */
  defaultLimit?: number;
  /** Maximum allowed `limit` value. Default: `100`. */
  maxLimit?: number;
  /** Pagination style. Default: `'cursor'`. */
  style?: 'cursor' | 'offset';
}

// ─── Auth Types ─────────────────────────────────────────────────────────────

export type AuthType = 'none' | 'bearer' | 'apiKey' | 'oauth2';

export interface AuthConfig {
  type: AuthType;
  description?: string;
}

// ─── Event Types ────────────────────────────────────────────────────────────

export interface EventDefinition {
  description: string;
  data?: Record<string, ParamSchema | TypeRef>;
}

// ─── Channel Types ──────────────────────────────────────────────────────────

/**
 * Configuration for a real-time channel declared in `SurfConfig.channels`.
 * Describes the channel's purpose and the shape of its state.
 */
export interface ChannelDefinition {
  /** Human-readable description of what this channel provides. */
  description: string;
  /** Schema describing the shape of state pushed on this channel. */
  stateSchema?: Record<string, ParamSchema | TypeRef>;
  /** Initial state value (runtime-only — not included in manifest). */
  initialState?: unknown;
}

/**
 * Manifest-safe representation of a channel.
 * Excludes runtime-only data like initial state values.
 */
export interface ManifestChannel {
  /** Human-readable description of what this channel provides. */
  description: string;
  /** Schema describing the shape of state pushed on this channel. */
  stateSchema?: Record<string, ParamSchema | TypeRef>;
}

// ─── Manifest Types ─────────────────────────────────────────────────────────

export interface ManifestCommand {
  description: string;
  params?: Record<string, ParamSchema>;
  returns?: ParamSchema | TypeRef;
  tags?: string[];
  auth?: 'none' | 'required' | 'optional' | 'hidden' | boolean;
  hints?: CommandHints;
  examples?: CommandExample[];
  rateLimit?: { windowMs: number; maxRequests: number };
  /** Whether this command supports pagination. Agents can detect this to auto-iterate. */
  paginated?: boolean;
  /** Required auth scopes — token must have ALL listed scopes. */
  requiredScopes?: string[];
}

export interface SurfManifest {
  surf: string;
  name: string;
  description?: string;
  /** Longer human/agent-readable context about the site — what it does, what kind of content, editorial tone. */
  about?: string;
  version?: string;
  baseUrl?: string;
  auth?: AuthConfig;
  commands: Record<string, ManifestCommand>;
  events?: Record<string, EventDefinition>;
  types?: Record<string, TypeDefinition>;
  /** Real-time channels available for subscription via Surf Live. */
  channels?: Record<string, ManifestChannel>;
  /** Deterministic SHA-256 hash of the commands schema. */
  checksum: string;
  /** ISO timestamp of when the Surf instance was created. */
  updatedAt: string;
}

// ─── Config Types ───────────────────────────────────────────────────────────

/**
 * Top-level configuration for `createSurf()`.
 * Defines the site's name, commands, auth, and behavior.
 */
export interface SurfConfig {
  /** Site/service name — shown in the manifest and DevUI. */
  name: string;
  description?: string;
  /** Longer context about your site for agents — what it does, content types, editorial tone. */
  about?: string;
  version?: string;
  baseUrl?: string;
  auth?: AuthConfig;
  commands: Record<string, CommandDefinition | CommandGroup>;
  events?: Record<string, EventDefinition>;
  types?: Record<string, TypeDefinition>;
  /** Real-time channels available for Surf Live subscription. */
  channels?: Record<string, ChannelDefinition>;
  /** Middleware pipeline applied to all command executions. */
  middleware?: import('./middleware.js').SurfMiddleware[];
  /** Auth verifier - when set, Surf auto-installs an auth enforcement middleware. */
  authVerifier?: import('./auth.js').AuthVerifier;
  /** Global rate limit applied to all commands (per-command config overrides this). */
  rateLimit?: RateLimitConfig;
  /** Validate command return values against their declared `returns` schema. */
  validateReturns?: boolean;
  /** Reject requests that include params not defined in the command schema. Default: `false`. */
  strictParams?: boolean;
  /** Strict mode — enables validateReturns, strictParams, and other strict checks. */
  strict?: boolean;
  /** Enable debug mode — exposes detailed error messages. Disable in production. */
  debug?: boolean;
  /**
   * CORS configuration for all HTTP transports and adapters.
   *
   * - Omit or set `origin: '*'` for default wildcard (backwards-compatible).
   * - Provide a string, string array, or function for restrictive origins.
   * - Set `credentials: true` to include `Access-Control-Allow-Credentials`.
   */
  cors?: import('./cors.js').CorsConfig;
  /** Surf Live — real-time state sync configuration. Disabled by default. */
  live?: LiveConfig;
}

/**
 * Configuration for Surf Live — real-time state sync via channels.
 * Must be explicitly enabled. Off by default for security.
 */
export interface LiveConfig {
  /** Enable Surf Live real-time broadcasting. Default: false */
  enabled?: boolean;
  /** Maximum channels per connection. Default: 10 */
  maxChannelsPerConnection?: number;
  /** Channel auth — verify if a token can subscribe to a channel */
  channelAuth?: (token: string, channelId: string) => Promise<boolean>;
  /** Allowed WebSocket origins. Prevents Cross-Site WebSocket Hijacking. If not set, all origins are rejected in production (NODE_ENV=production). */
  allowedOrigins?: string[];
  /** Maximum incoming WebSocket message size in bytes. Default: 1MB (1048576) */
  maxPayloadBytes?: number;
}

// ─── Transport Types ────────────────────────────────────────────────────────

export interface ExecuteRequest {
  command: string;
  params?: Record<string, unknown>;
  requestId?: string;
  sessionId?: string;
  /** Request SSE streaming response. */
  stream?: boolean;
}

// ─── Streaming Types ────────────────────────────────────────────────────────

export type StreamChunk =
  | { type: 'chunk'; data: unknown }
  | { type: 'done'; result?: unknown }
  | { type: 'error'; error: { code: string; message: string } };

// ─── Pipeline Types ─────────────────────────────────────────────────────────

export interface PipelineStep {
  command: string;
  params?: Record<string, unknown>;
  /** Alias name to store the result for later `$alias` references. */
  as?: string;
}

export interface PipelineRequest {
  steps: PipelineStep[];
  sessionId?: string;
  /** Continue executing subsequent steps even if one fails. */
  continueOnError?: boolean;
}

export interface PipelineStepResult {
  command: string;
  ok: boolean;
  result?: unknown;
  error?: { code: string; message: string };
}

export interface PipelineResponse {
  ok: boolean;
  results: PipelineStepResult[];
}

export interface ExecuteResponse {
  ok: true;
  requestId?: string;
  result: unknown;
  state?: Record<string, unknown>;
  sessionId?: string;
}

export interface ErrorResponse {
  ok: false;
  requestId?: string;
  error: {
    code: SurfErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

export type SurfResponse = ExecuteResponse | ErrorResponse;

// ─── WebSocket Message Types ────────────────────────────────────────────────

export interface WsExecuteMessage {
  type: 'execute';
  id: string;
  command: string;
  params?: Record<string, unknown>;
  sessionId?: string;
}

export interface WsResultMessage {
  type: 'result';
  id: string;
  ok: boolean;
  result?: unknown;
  state?: Record<string, unknown>;
  error?: {
    code: SurfErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface WsEventMessage {
  type: 'event';
  event: string;
  data: unknown;
}

export interface WsAuthMessage {
  type: 'auth';
  token: string;
}

export interface WsSessionMessage {
  type: 'session';
  action: 'start' | 'end';
  sessionId?: string;
}

export interface WsSubscribeMessage {
  type: 'subscribe';
  channels: string[];
}

export interface WsUnsubscribeMessage {
  type: 'unsubscribe';
  channels: string[];
}

export type WsIncomingMessage = WsExecuteMessage | WsAuthMessage | WsSessionMessage | WsSubscribeMessage | WsUnsubscribeMessage;
export type WsOutgoingMessage = WsResultMessage | WsEventMessage;

// ─── Session Types ──────────────────────────────────────────────────────────

export interface Session {
  id: string;
  state: Record<string, unknown>;
  createdAt: number;
  lastAccessedAt: number;
}

export interface SessionStore {
  create(): Promise<Session>;
  get(id: string): Promise<Session | undefined>;
  update(id: string, state: Record<string, unknown>): Promise<void>;
  destroy(id: string): Promise<void>;
}

// ─── Error Codes ────────────────────────────────────────────────────────────

/**
 * Machine-readable error codes returned in error responses.
 *
 * | Code | HTTP | Meaning |
 * |------|------|---------|
 * | `UNKNOWN_COMMAND` | 404 | Command name not found in manifest |
 * | `NOT_FOUND` | 404 | Command exists but the requested resource was not found |
 * | `INVALID_PARAMS` | 400 | Missing required param, wrong type, or invalid value |
 * | `AUTH_REQUIRED` | 401 | Command requires authentication but none was provided |
 * | `AUTH_FAILED` | 403 | Token/key was provided but is invalid or expired |
 * | `SESSION_EXPIRED` | 410 | Session ID is no longer valid |
 * | `RATE_LIMITED` | 429 | Too many requests — check `Retry-After` header |
 * | `INTERNAL_ERROR` | 500 | Unexpected server error during command execution |
 * | `NOT_SUPPORTED` | 501 | Feature or transport not available |
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

// ─── HTTP Handler Types ─────────────────────────────────────────────────────

export interface IncomingRequest {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface OutgoingResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export type HttpHandler = (
  req: IncomingRequest,
  res: {
    writeHead(status: number, headers?: Record<string, string>): void;
    end(body?: string): void;
  },
) => void | Promise<void>;
