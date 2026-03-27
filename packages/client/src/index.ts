export { SurfClient, SurfClientError } from './client.js';
export { discoverManifest } from './discovery.js';
export { HttpTransport } from './transport/http.js';
export { WebSocketTransport } from './transport/websocket.js';
export type { ConnectionState, WebSocketTransportOptions } from './transport/websocket.js';
export { WindowTransport } from './transport/window.js';

export { SURF_ERROR_CODES, isSurfErrorCode } from './types.js';

export type {
  SurfManifest,
  ManifestCommand,
  SurfClientOptions,
  SurfSession,
  UpdateCheckResult,
  ParamSchema,
  ParamType,
  TypeRef,
  CommandHints,
  AuthConfig,
  EventDefinition,
  TypeDefinition,
  SurfErrorCode,
  ExecuteResponse,
  ErrorResponse,
  SurfResponse,
  RetryConfig,
  CacheConfig,
  TypedCommands,
  TypedClient,
  PipelineStep,
  PipelineStepResult,
  PipelineResponse,
} from './types.js';
