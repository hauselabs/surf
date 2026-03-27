<div align="center">

# @surfjs/core

**Give AI agents a typed CLI to your website.**

[![npm](https://img.shields.io/npm/v/@surfjs/core?color=0057FF&label=npm)](https://www.npmjs.com/package/@surfjs/core)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/hauselabs/surf/blob/main/LICENSE)
[![GitHub](https://img.shields.io/github/stars/hauselabs/surf?style=social)](https://github.com/hauselabs/surf)

</div>

---

Surf is an **open protocol** that lets websites expose structured commands for AI agents — like a CLI for the web. Instead of scraping HTML or wrestling with vision models, agents discover a typed manifest at `/.well-known/surf.json` and execute commands directly.

**`@surfjs/core`** is the server-side library for the Surf protocol. Define commands with typed parameters, mount middleware, and let any framework serve them.

### Why Surf?

- 🎯 **Structured, not scraped** — Agents call commands with typed params, not CSS selectors
- 🔒 **Auth built-in** — Bearer, API key, OAuth2 support out of the box
- ⚡ **Streaming** — SSE for long-running operations
- 🧩 **Any framework** — Express, Next.js, Fastify, Hono, or raw Node
- 📋 **Auto-generated manifest** — `/.well-known/surf.json` describes your entire API
- 🏷️ **Namespaced commands** — Organize with dot notation (`cart.add`, `cart.remove`)

### Ecosystem

| Package | Description |
|---------|-------------|
| **@surfjs/core** | Server-side command registry & middleware |
| [@surfjs/web](https://www.npmjs.com/package/@surfjs/web) | Browser runtime — `window.surf` local execution |
| [@surfjs/react](https://www.npmjs.com/package/@surfjs/react) | React hooks — `useSurfCommands`, `SurfProvider`, `SurfBadge` |
| [@surfjs/client](https://www.npmjs.com/package/@surfjs/client) | Agent-side SDK for discovering and executing commands |
| [@surfjs/cli](https://www.npmjs.com/package/@surfjs/cli) | CLI to inspect, test, and ping Surf endpoints |
| [@surfjs/devui](https://www.npmjs.com/package/@surfjs/devui) | Interactive dev inspector |

📖 **[Full documentation](https://surf.codes/docs)** · 🎮 **[Live demo](https://surf.codes/demo)** · 🐙 **[GitHub](https://github.com/hauselabs/surf)**

---

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
  about?: string;                        // Longer context for agents (site purpose, content, tone)
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
  tags?: string[];                        // Categorize: ['read-only', 'content']
  auth?: 'none' | 'required' | 'optional';
  hints?: CommandHints;
  stream?: boolean;                       // Enable SSE streaming
  rateLimit?: RateLimitConfig;           // Per-command rate limit (also shown in manifest)
  examples?: CommandExample[];           // Sample request/response for agents
  run: CommandHandler<TParams, TResult>;
}

interface CommandExample {
  title?: string;                         // Human-readable label
  params: Record<string, unknown>;        // Example input
  result?: unknown;                       // Example output
}
```

### `defineCommand` — Typed Handlers

Use `defineCommand` instead of plain object literals to get **automatic type inference** for your `run` handler's `params` argument. No manual generics needed.

```ts
import { defineCommand } from '@surfjs/core';

const getUser = defineCommand({
  description: 'Get a user by ID',
  params: {
    id:     { type: 'string', required: true, description: 'User ID' },
    expand: { type: 'boolean', description: 'Include related objects' },
  },
  run(params, ctx) {
    // params.id     → string          (required — always present)
    // params.expand  → boolean | undefined (optional)
    return db.users.find(params.id);
  },
});
```

`defineCommand` is an identity function at runtime — zero overhead. It returns a standard `CommandDefinition`, so it works everywhere `createSurf` expects one.

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
  execution?: 'any' | 'browser' | 'server';  // Where the command runs
}
```

#### Execution hints

The `execution` hint tells agents (and the `@surfjs/web` runtime) where a command should run:

```typescript
hints: { execution: 'browser' }  // Runs locally in browser via window.surf. No server call.
hints: { execution: 'server' }   // Runs on the server only. Always goes through HTTP/WS.
hints: { execution: 'any' }      // Works everywhere (default). Runtime picks the fastest path.
```

Commands with `execution: 'browser'` are handled by `@surfjs/web` local handlers registered via `useSurfCommands`. If no local handler is found, execution falls back to the server.

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
  scopes?: string[];
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

### Scoped Auth

Use `scopedVerifier` to map tokens to permission scopes, and `requiredScopes` to restrict commands:

```ts
import { createSurf, scopedVerifier } from '@surfjs/core';

const surf = await createSurf({
  name: 'My Store',
  authVerifier: scopedVerifier({
    'read-token': ['read'],
    'admin-token': ['read', 'cart:write', 'admin'],
  }),
  commands: {
    search: {
      description: 'Search products',
      auth: 'required',
      requiredScopes: ['read'],
      run: async (params, ctx) => {
        // ctx.scopes → ['read'] or ['read', 'cart:write', 'admin']
        return { results: [] };
      },
    },
    checkout: {
      description: 'Complete purchase',
      auth: 'required',
      requiredScopes: ['cart:write'],
      run: async (params, ctx) => ({ orderId: '123' }),
    },
  },
});
```

A token must have **all** listed `requiredScopes` to call a command. Missing scopes return an `AUTH_FAILED` error with details on which scopes are missing. Scopes are exposed to handlers via `ctx.scopes`.

## Command Namespacing

Nest objects to create dot-notation command names:

```ts
const surf = createSurf({
  name: 'My App',
  commands: {
    cart: {
      _description: 'Shopping cart management',  // Namespace description (shown to agents)
      add: { description: 'Add item to cart', run: async (p) => {} },
      remove: { description: 'Remove item', run: async (p) => {} },
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
  notFound,
  invalidParams,
  authRequired,
  authFailed,
  sessionExpired,
  rateLimited,
  internalError,
  notSupported,
} from '@surfjs/core';

throw notFound('article', 'my-slug');
// → SurfError { code: 'NOT_FOUND', message: 'article not found: my-slug' }

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

## Edge Runtime Compatibility

`@surfjs/core` is compatible with edge runtimes including **Cloudflare Workers**, **Vercel Edge Functions**, and **Deno Deploy**. The package uses the Web Crypto API (`crypto.subtle`) instead of Node.js `node:crypto`, and declares an `edge-light` export condition for bundler compatibility.

**Caveats:**
- `createSurf()` is async (returns `Promise<SurfInstance>`) due to Web Crypto's async digest API.
- The WebSocket transport (`wsHandler()`) requires the `ws` npm package and is Node-only. In edge environments, use the HTTP transport or SSE instead. If you need WebSocket support in an edge runtime, provide a WS-compatible polyfill.

## License

[MIT](../../LICENSE)
