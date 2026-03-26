// ─── Main Entry Point ────────────────────────────────────────────────────────

export { createSurf } from './surf.js';
export type { SurfInstance, SurfLive } from './surf.js';
export { deepMerge } from './deepMerge.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type {
  // Config
  SurfConfig,
  SurfManifest,
  ManifestCommand,

  // Commands
  CommandDefinition,
  CommandExample,
  CommandHandler,
  CommandHints,
  ExecutionContext,
  CommandGroup,

  // Parameters
  ParamSchema,
  ParamType,
  TypeRef,
  TypeDefinition,

  // Auth
  AuthConfig,
  AuthType,

  // Events
  EventDefinition,

  // Channels
  ChannelDefinition,
  ManifestChannel,

  // Sessions
  Session,
  SessionStore,

  // Transport
  ExecuteRequest,
  ExecuteResponse,
  ErrorResponse,
  SurfResponse,
  HttpHandler,

  // WebSocket messages
  WsExecuteMessage,
  WsResultMessage,
  WsEventMessage,
  WsAuthMessage,
  WsSessionMessage,
  WsSubscribeMessage,
  WsUnsubscribeMessage,
  WsIncomingMessage,
  WsOutgoingMessage,

  // Live config
  LiveConfig,

  // Error codes
  SurfErrorCode,

  // Streaming
  StreamChunk,

  // Pipeline
  PipelineStep,
  PipelineRequest,
  PipelineStepResult,
  PipelineResponse,

  // Rate limiting
  RateLimitConfig,

  // Pagination
  PaginatedParams,
  PaginatedResult,
  PaginationConfig,
} from './types.js';

// ─── Errors ──────────────────────────────────────────────────────────────────

export {
  SurfError,
  unknownCommand,
  invalidParams,
  authRequired,
  authFailed,
  sessionExpired,
  rateLimited,
  internalError,
  notSupported,
  notFound,
} from './errors.js';

// ─── Middleware ───────────────────────────────────────────────────────────────

export type { SurfMiddleware, MiddlewareContext } from './middleware.js';
export { runMiddlewarePipeline } from './middleware.js';

// ─── Auth ─────────────────────────────────────────────────────────────────────

export type { AuthVerifier, AuthResult } from './auth.js';
export { bearerVerifier, scopedVerifier, createAuthMiddleware } from './auth.js';

// ─── Namespacing ──────────────────────────────────────────────────────────────

export { flattenCommands, isCommandDefinition, group } from './namespace.js';

// ─── Rate Limiting ────────────────────────────────────────────────────────────

export { RateLimiter } from './ratelimit.js';

// ─── Validation ───────────────────────────────────────────────────────────────

export { validateParams, validateResult } from './validation.js';

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export { executePipeline } from './transport/pipeline.js';

// ─── Framework Adapters ───────────────────────────────────────────────────

export { fastifyPlugin } from './adapters/fastify.js';
export { honoApp, honoMiddleware } from './adapters/hono.js';

// ─── Pagination ───────────────────────────────────────────────────────────────

export { paginatedResult } from './pagination.js';

// ─── Typed Command Helpers ────────────────────────────────────────────────────

export { defineCommand } from './infer.js';
export type { InferParam, InferParams } from './infer.js';

// ─── Internal utilities (for advanced use) ────────────────────────────────────

export { CommandRegistry } from './commands.js';
export { InMemorySessionStore } from './session.js';
export { EventBus } from './events.js';
export type { EventScope, ScopedEventDefinition, SubscribeOptions } from './events.js';
export { generateManifest, type ManifestOptions } from './manifest.js';
