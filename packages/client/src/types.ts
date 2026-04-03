// ─── Manifest Types (mirrored from core for independence) ───────────────────

export type ParamType = 'string' | 'number' | 'boolean' | 'object' | 'array';

export interface ParamSchema {
  type: ParamType;
  required?: boolean;
  default?: unknown;
  description?: string;
  enum?: readonly string[];
  properties?: Record<string, ParamSchema>;
  items?: ParamSchema | TypeRef;
}

export interface TypeRef {
  $ref: string;
}

export interface CommandHints {
  idempotent?: boolean;
  sideEffects?: boolean;
  estimatedMs?: number;
  /** Where this command can be executed. `'any'` (default), `'browser'` (client-side only), or `'server'`. */
  execution?: 'any' | 'browser' | 'server';
}

/** A concrete example of calling a command, shown to agents in the manifest. */
export interface CommandExample {
  /** Human-readable label for this example. */
  title?: string;
  params: Record<string, unknown>;
  result?: unknown;
}

export interface ManifestCommand {
  description: string;
  params?: Record<string, ParamSchema>;
  returns?: ParamSchema | TypeRef;
  tags?: string[];
  auth?: 'none' | 'required' | 'optional' | 'hidden' | boolean;
  hints?: CommandHints;
  /** Example request/response pairs — helps agents understand usage. */
  examples?: CommandExample[];
  /** Per-command rate limiting. */
  rateLimit?: { windowMs: number; maxRequests: number };
  /** Whether this command supports pagination. */
  paginated?: boolean;
  /** Required auth scopes — token must have ALL listed scopes. */
  requiredScopes?: string[];
}

export interface AuthConfig {
  type: 'none' | 'bearer' | 'apiKey' | 'oauth2';
  description?: string;
}

export interface EventDefinition {
  description: string;
  data?: Record<string, ParamSchema | TypeRef>;
}

export interface TypeDefinition {
  type: ParamType;
  properties?: Record<string, ParamSchema | TypeRef>;
  items?: ParamSchema | TypeRef;
  description?: string;
}

export interface SurfManifest {
  surf: string;
  name: string;
  description?: string;
  version?: string;
  baseUrl?: string;
  auth?: AuthConfig;
  commands: Record<string, ManifestCommand>;
  events?: Record<string, EventDefinition>;
  types?: Record<string, TypeDefinition>;
  /** Deterministic SHA-256 hash of the commands schema. */
  checksum: string;
  /** ISO timestamp of when the Surf instance was created. */
  updatedAt: string;
}

/** Result from checkForUpdates(). */
export interface UpdateCheckResult {
  changed: boolean;
  checksum: string;
}

// ─── Response Types ─────────────────────────────────────────────────────────

/**
 * Server-side error codes returned in Surf error responses.
 * These correspond to HTTP status codes and appear in `ErrorResponse.error.code`.
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

/** Exhaustive list of valid SurfErrorCode values. */
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

/** Type guard: check whether a string is a valid SurfErrorCode. */
export function isSurfErrorCode(code: string): code is SurfErrorCode {
  return (SURF_ERROR_CODES as readonly string[]).includes(code);
}

/**
 * Client-side error codes thrown by the SurfClient SDK.
 * These represent transport, connection, and protocol-level failures
 * that occur before or after a server response.
 *
 * | Code | Meaning |
 * |------|---------|
 * | `NETWORK_ERROR` | Network-level failure (WebSocket closed, HTTP error, fetch failed) |
 * | `TIMEOUT` | Request or discovery timed out |
 * | `NOT_CONNECTED` | Transport not connected — call connect() first |
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

// ─── Client Options ─────────────────────────────────────────────────────────

export interface RetryConfig {
  maxAttempts: number;
  backoffMs: number;
  backoffMultiplier: number;
  /** HTTP status codes to retry on. Default: [429, 502, 503, 504] */
  retryOn?: number[];
}

export interface CacheConfig {
  /** Cache TTL in milliseconds. */
  ttlMs: number;
  /** Maximum number of cached entries. */
  maxSize: number;
}

/** Typed commands map: Record<commandName, { params, result }> */
export type TypedCommands = Record<string, { params: Record<string, unknown>; result: unknown }>;

/** A typed proxy client where each method name corresponds to a command. */
export type TypedClient<T extends TypedCommands> = {
  [K in keyof T]: (params: T[K]['params']) => Promise<T[K]['result']>;
};

/** Pipeline step for multi-command requests. */
export interface PipelineStep {
  command: string;
  params?: Record<string, unknown>;
  as?: string;
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

export interface SurfClientOptions {
  /** Base URL of the Surf-enabled site */
  baseUrl: string;
  /** Pre-loaded manifest (skips discovery) */
  manifest?: SurfManifest;
  /** Auth token for authenticated commands */
  auth?: string;
  /** Custom fetch implementation */
  fetch?: typeof globalThis.fetch;
  /** Retry configuration for failed requests. */
  retry?: RetryConfig;
  /** Response cache configuration. */
  cache?: CacheConfig;
  /** Timeout for manifest discovery in ms. Default: 5000 */
  discoverTimeout?: number;
  /**
   * Base path for Surf execute endpoint. Default: '/surf/execute'.
   * Override to '/api/surf/execute' when using @surfjs/next with App Router.
   * @example '/api/surf/execute'
   */
  basePath?: string;
}

export interface SurfSession {
  /** Session ID */
  readonly id: string;
  /** Current session state */
  readonly state: Record<string, unknown>;
  /** Execute a command within this session */
  execute(command: string, params?: Record<string, unknown>): Promise<unknown>;
  /** End the session */
  end(): Promise<void>;
}

// ─── WebSocket Message Types ────────────────────────────────────────────────

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

export type WsIncomingMessage = WsResultMessage | WsEventMessage;
