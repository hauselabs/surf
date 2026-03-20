# @surfjs/core

> Server-side library for the Surf protocol — define commands, generate manifests, handle transports.

```bash
npm install @surfjs/core
```

## Quick Start

```ts
import { createSurf } from '@surfjs/core';
import express from 'express';

const app = express();
app.use(express.json());

const surf = createSurf({
  name: 'My API',
  commands: {
    hello: {
      description: 'Say hello',
      params: { name: { type: 'string', required: true } },
      run: async ({ name }) => ({ message: `Hello, ${name}!` }),
    },
  },
});

app.use(surf.middleware());
app.listen(3000);
```

## API

### `createSurf(config: SurfConfig): SurfInstance`

Creates a Surf instance with all transports and middleware configured.

### SurfConfig

```ts
interface SurfConfig {
  name: string;                          // Service name (required)
  description?: string;
  version?: string;
  baseUrl?: string;
  auth?: AuthConfig;                     // { type: 'bearer' | 'apiKey' | 'oauth2' | 'none' }
  commands: Record<string, CommandDefinition | CommandGroup>;
  events?: Record<string, EventDefinition>;
  types?: Record<string, TypeDefinition>;
  middleware?: SurfMiddleware[];
  authVerifier?: AuthVerifier;           // Auto-installs auth middleware
  rateLimit?: RateLimitConfig;           // Global rate limit
  validateReturns?: boolean;             // Validate return values against schema
  strict?: boolean;                      // Enables validateReturns + strict checks
}
```

### SurfInstance

```ts
interface SurfInstance {
  manifest(): SurfManifest;
  manifestHandler(): HttpHandler;        // GET /.well-known/surf.json
  httpHandler(): HttpHandler;            // POST /surf/execute
  middleware(): HttpHandler;             // Combined Express/Connect middleware
  wsHandler(server): void;              // Attach WebSocket (requires 'ws' package)
  browserScript(): string;              // window.__surf__ runtime
  browserBridge(): string;              // In-page bridge code
  use(middleware: SurfMiddleware): void;
  emit(event: string, data: unknown): void;
  readonly events: EventBus;
  readonly sessions: SessionStore;
  readonly commands: CommandRegistry;
}
```

### CommandDefinition

```ts
interface CommandDefinition<TParams = Record<string, unknown>, TResult = unknown> {
  description: string;                    // Required — shown to agents
  params?: Record<string, ParamSchema>;
  returns?: ParamSchema | TypeRef;
  tags?: string[];
  auth?: 'none' | 'required' | 'optional';
  hints?: CommandHints;
  stream?: boolean;                       // Enable SSE streaming
  rateLimit?: RateLimitConfig;           // Per-command rate limit
  run: CommandHandler<TParams, TResult>;
}
```

### ParamSchema

```ts
interface ParamSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  default?: unknown;
  description?: string;
  enum?: readonly string[];              // Restrict values (string params)
  properties?: Record<string, ParamSchema>;  // For object type
  items?: ParamSchema | TypeRef;         // For array type
}
```

### CommandHints

```ts
interface CommandHints {
  idempotent?: boolean;    // Safe to retry (same params → same result)
  sideEffects?: boolean;   // Whether the command modifies state
  estimatedMs?: number;    // Expected execution time
}
```

### ExecutionContext

Passed to every command handler as the second argument:

```ts
interface ExecutionContext {
  sessionId?: string;
  auth?: string;                          // Raw auth token
  state?: Record<string, unknown>;       // Session state (mutable)
  requestId?: string;
  claims?: Record<string, unknown>;      // Verified auth claims
  ip?: string;                           // Client IP
  emit?: (data: unknown) => void;        // Streaming chunk emitter
}
```

### RateLimitConfig

```ts
interface RateLimitConfig {
  windowMs: number;        // Time window in ms
  maxRequests: number;     // Max requests per window
  keyBy?: 'ip' | 'session' | 'auth' | 'global';  // Grouping key (default: 'ip')
}
```

## Middleware

```ts
type SurfMiddleware = (ctx: MiddlewareContext, next: () => Promise<void>) => Promise<void>;

interface MiddlewareContext {
  readonly command: string;
  params: Record<string, unknown>;
  context: ExecutionContext;
  result?: SurfResponse;        // Set to short-circuit with success
  error?: SurfResponse;         // Set to short-circuit with error
}
```

```ts
const logger: SurfMiddleware = async (ctx, next) => {
  console.log(`→ ${ctx.command}`);
  await next();
  console.log(`← ${ctx.command}`);
};

surf.use(logger);
```

## Authentication

### AuthVerifier

```ts
type AuthVerifier = (token: string, command: string) => Promise<AuthResult>;

interface AuthResult {
  valid: boolean;
  claims?: Record<string, unknown>;
  reason?: string;
}
```

### bearerVerifier

Simple token-list verifier:

```ts
import { bearerVerifier } from '@surfjs/core';

const surf = createSurf({
  authVerifier: bearerVerifier(['secret-token-1', 'secret-token-2']),
  commands: {
    admin: { description: 'Admin only', auth: 'required', run: async () => {} },
  },
});
```

## Command Namespacing

Nest objects to create dot-notation command names:

```ts
const surf = createSurf({
  name: 'My App',
  commands: {
    cart: {
      add: { description: 'Add to cart', run: async (p) => {} },
      remove: { description: 'Remove', run: async (p) => {} },
    },
  },
});
// → cart.add, cart.remove
```

Helper utilities: `flattenCommands()`, `isCommandDefinition()`, `group()`.

## Events

### EventBus

Session-aware event emitter with three scopes:

| Scope | Behavior |
|---|---|
| `session` (default) | Delivered only to the triggering session |
| `global` | Delivered to all subscribers |
| `broadcast` | Delivered to all connected clients |

```ts
// Define events with scope
const surf = createSurf({
  events: {
    'order.updated': {
      description: 'Order status changed',
      scope: 'session',
      data: { orderId: { type: 'string' } },
    },
  },
  commands: { /* ... */ },
});

// Subscribe (optionally scoped to a session)
const unsub = surf.events.on('order.updated', (data) => {}, sessionId);

// Emit with session context
surf.events.emit('order.updated', { orderId: '123' }, sessionId);

// Cleanup
surf.events.removeSession(sessionId);
surf.events.off('order.updated'); // Remove all listeners for event
surf.events.off();                // Remove all listeners
```

## Streaming (SSE)

Mark a command with `stream: true` and use `context.emit`:

```ts
{
  description: 'Generate tokens',
  stream: true,
  run: async ({ prompt }, { emit }) => {
    for (const token of tokens) {
      emit!({ token });        // SSE: data: {"type":"chunk","data":{"token":"..."}}
    }
    return { done: true };     // SSE: data: {"type":"done","result":{"done":true}}
  },
}
```

## Framework Adapters

### Fastify

```ts
import { fastifyPlugin } from '@surfjs/core/fastify';

const app = Fastify();
app.register(fastifyPlugin(surf));
```

Mounts: `GET /.well-known/surf.json`, `POST /surf/execute`, `POST /surf/pipeline`, `POST /surf/session/start`, `POST /surf/session/end`

### Hono

```ts
import { honoApp, honoMiddleware } from '@surfjs/core/hono';

// Sub-app approach
const app = new Hono();
app.route('/', honoApp(surf));

// Or as a fetch handler (Cloudflare Workers, Bun, etc.)
export default { fetch: honoMiddleware(surf) };
```

Same routes as Fastify adapter.

## Reusable Types

```ts
const surf = createSurf({
  types: {
    Product: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        price: { type: 'number' },
      },
    },
  },
  commands: {
    search: {
      description: 'Search',
      returns: { type: 'array', items: { $ref: '#/types/Product' } },
      run: async () => [],
    },
  },
});
```

## Validation

```ts
import { validateParams, validateResult } from '@surfjs/core';

// Validate params against schema
validateParams(params, command.params);

// Validate return value against schema
validateResult(result, command.returns);
```

## Error Helpers

```ts
import {
  SurfError,
  unknownCommand,
  invalidParams,
  authRequired,
  authFailed,
  sessionExpired,
  rateLimited,
  internalError,
  notSupported,
} from '@surfjs/core';

throw unknownCommand('nonexistent');
// → SurfError { code: 'UNKNOWN_COMMAND', message: '...', httpStatus: 404 }
```

## HTTP Endpoints

When using `surf.middleware()` or a framework adapter, these endpoints are mounted:

| Method | Path | Description |
|---|---|---|
| `GET` | `/.well-known/surf.json` | Manifest (with ETag + Cache-Control) |
| `POST` | `/surf/execute` | Execute a command |
| `POST` | `/surf/pipeline` | Execute multiple commands |
| `POST` | `/surf/session/start` | Start a session |
| `POST` | `/surf/session/end` | End a session |

## Exports

All types and utilities are exported from the main entry point:

```ts
import {
  createSurf,
  // Types
  type SurfConfig, type SurfManifest, type SurfInstance,
  type CommandDefinition, type CommandGroup, type CommandHints,
  type ExecutionContext, type ParamSchema, type ParamType, type TypeRef,
  type AuthConfig, type EventDefinition, type RateLimitConfig,
  type ExecuteRequest, type ExecuteResponse, type ErrorResponse, type SurfResponse,
  type StreamChunk, type PipelineStep, type PipelineRequest, type PipelineResponse,
  type SurfErrorCode, type Session, type SessionStore,
  // WebSocket types
  type WsExecuteMessage, type WsResultMessage, type WsEventMessage,
  // Middleware
  type SurfMiddleware, type MiddlewareContext, runMiddlewarePipeline,
  // Auth
  type AuthVerifier, type AuthResult, bearerVerifier, createAuthMiddleware,
  // Utilities
  flattenCommands, isCommandDefinition, group,
  RateLimiter, validateParams, validateResult,
  CommandRegistry, InMemorySessionStore, EventBus,
  type EventScope, type ScopedEventDefinition,
  generateManifest, executePipeline,
  // Errors
  SurfError, unknownCommand, invalidParams, authRequired,
  authFailed, sessionExpired, rateLimited, internalError, notSupported,
  // Adapters
  fastifyPlugin, honoApp, honoMiddleware,
} from '@surfjs/core';
```

## License

[MIT](../../LICENSE)
