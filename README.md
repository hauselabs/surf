<div align="center">

# 🏄 Surf.js

**Give AI agents a CLI to your website.**

[![npm version](https://img.shields.io/npm/v/@surfjs/core.svg?style=flat-square)](https://www.npmjs.com/package/@surfjs/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

[Website](https://surf.codes) · [Docs](https://surf.codes/docs) · [Protocol Spec](./SPEC.md) · [Examples](./examples) · [Contributing](./CONTRIBUTING.md)

</div>

---

AI agents shouldn't need vision models to click buttons on a webpage. That's slow, expensive, and breaks every time the UI changes.

**Surf** is an open protocol + JavaScript library that lets any website expose **typed commands** for AI agents — like `robots.txt`, but for what agents can *do*.

- 🔍 **Discoverable** — Agents find your commands at `/.well-known/surf.json`, automatically
- ⚡ **Fast** — Direct command execution. No screenshots, no DOM parsing. ~200ms vs ~30s
- 🔒 **Typed & Safe** — Full parameter validation, auth, rate limiting, sessions — built in

## Quick Start

```bash
npm install @surfjs/core
```

```js
import { createSurf } from '@surfjs/core';
import express from 'express';

const app = express();
app.use(express.json());

const surf = await createSurf({
  name: 'My Store',
  commands: {
    search: {
      description: 'Search products',
      params: { query: { type: 'string', required: true } },
      run: async ({ query }) => db.products.search(query),
    },
  },
});

app.use(surf.middleware());
app.listen(3000);
// → Manifest served at GET /.well-known/surf.json
// → Commands executable at POST /surf/execute
// → Pipelines at POST /surf/pipeline
// → Sessions at POST /surf/session/start and /surf/session/end
```

That's it. Your site is now agent-navigable.

## How It Works

### 1. Define commands

Map your app's capabilities to typed, documented commands:

```ts
const surf = await createSurf({
  name: 'Acme Store',
  commands: {
    search: {
      description: 'Search products by query',
      params: {
        query: { type: 'string', required: true },
        maxPrice: { type: 'number' },
        category: { type: 'string', enum: ['electronics', 'clothing', 'books'] },
      },
      returns: { type: 'array', items: { $ref: '#/types/Product' } },
      hints: { idempotent: true, sideEffects: false, estimatedMs: 200 },
      run: async ({ query, maxPrice, category }) => {
        return db.products.search(query, { maxPrice, category });
      },
    },
  },
});
```

### 2. Surf generates a manifest

A machine-readable `surf.json` is served at `/.well-known/surf.json` — agents discover it like `robots.txt`:

```json
{
  "surf": "0.1.0",
  "name": "Acme Store",
  "commands": {
    "search": {
      "description": "Search products by query",
      "params": {
        "query": { "type": "string", "required": true },
        "maxPrice": { "type": "number" },
        "category": { "type": "string", "enum": ["electronics", "clothing", "books"] }
      },
      "hints": { "idempotent": true, "sideEffects": false, "estimatedMs": 200 }
    }
  },
  "checksum": "a1b2c3...",
  "updatedAt": "2026-03-20T19:00:00.000Z"
}
```

### 3. Agents execute commands

Any agent — using any language — can discover and call your commands:

```ts
import { SurfClient } from '@surfjs/client';

const client = await SurfClient.discover('https://acme-store.com');
const results = await client.execute('search', { query: 'blue shoes', maxPrice: 100 });
```

## Why Surf?

| Without Surf | With Surf |
|---|---|
| Screenshot → parse → guess → click → retry | Read manifest → execute command → done |
| ~30 seconds per action | ~200ms per action |
| $0.05 in vision API calls per action | $0.00 |
| Breaks when UI changes | Stable as long as commands exist |
| Agent-specific integrations | One protocol, any agent |

## Packages

| Package | Description | |
|---|---|---|
| [`@surfjs/core`](./packages/core) | Server-side library — define commands, generate manifest, handle transports | [![npm](https://img.shields.io/npm/v/@surfjs/core.svg?style=flat-square)](https://www.npmjs.com/package/@surfjs/core) |
| [`@surfjs/client`](./packages/client) | Agent-side SDK — discover, execute, pipeline, sessions, WebSocket, typed client | [![npm](https://img.shields.io/npm/v/@surfjs/client.svg?style=flat-square)](https://www.npmjs.com/package/@surfjs/client) |
| [`@surfjs/cli`](./packages/cli) | Terminal tool — inspect, test, and ping Surf-enabled sites | [![npm](https://img.shields.io/npm/v/@surfjs/cli.svg?style=flat-square)](https://www.npmjs.com/package/@surfjs/cli) |
| [`@surfjs/devui`](./packages/devui) | Interactive browser-based dev inspector for Surf commands | [![npm](https://img.shields.io/npm/v/@surfjs/devui.svg?style=flat-square)](https://www.npmjs.com/package/@surfjs/devui) |
| [`@surfjs/next`](./packages/next) | Next.js App Router & Pages Router adapter | [![npm](https://img.shields.io/npm/v/@surfjs/next.svg?style=flat-square)](https://www.npmjs.com/package/@surfjs/next) |
| [`@surfjs/zod`](./packages/zod) | Zod schema integration for typed command params | [![npm](https://img.shields.io/npm/v/@surfjs/zod.svg?style=flat-square)](https://www.npmjs.com/package/@surfjs/zod) |
| [`@surfjs/react`](./packages/react) | React hooks for Surf Live — real-time state sync via WebSocket | [![npm](https://img.shields.io/npm/v/@surfjs/react.svg?style=flat-square)](https://www.npmjs.com/package/@surfjs/react) |

---

## Framework Adapters

### Express / Connect

```ts
import express from 'express';
import { createSurf } from '@surfjs/core';

const app = express();
app.use(express.json());
const surf = await createSurf({ name: 'My App', commands: { /* ... */ } });
app.use(surf.middleware());
```

### Fastify

```ts
import Fastify from 'fastify';
import { createSurf } from '@surfjs/core';
import { fastifyPlugin } from '@surfjs/core/fastify';

const surf = await createSurf({ name: 'My App', commands: { /* ... */ } });
const app = Fastify();
app.register(fastifyPlugin(surf));
```

### Hono

```ts
import { Hono } from 'hono';
import { createSurf } from '@surfjs/core';
import { honoApp } from '@surfjs/core/hono';

const surf = await createSurf({ name: 'My App', commands: { /* ... */ } });
const app = new Hono();
const surfApp = await honoApp(surf);
app.route('/', surfApp);
```

Hono also exports `honoMiddleware(surf)` which returns a fetch handler for Cloudflare Workers:

```ts
import { honoMiddleware } from '@surfjs/core/hono';
export default { fetch: honoMiddleware(surf) };
```

### Next.js (App Router)

```ts
// app/api/surf/surf-instance.ts
import { createSurf } from '@surfjs/core';
export const surf = await createSurf({ name: 'My App', commands: { /* ... */ } });

// app/api/surf/route.ts — GET /.well-known/surf.json (use next.config rewrite)
import { NextResponse } from 'next/server';
import { surf } from './surf-instance';
export async function GET() {
  return NextResponse.json(surf.manifest());
}

// app/api/surf/execute/route.ts — POST /api/surf/execute
import { NextRequest, NextResponse } from 'next/server';
import { surf } from '../surf-instance';
export async function POST(request: NextRequest) {
  const { command, params, sessionId } = await request.json();
  const response = await surf.commands.execute(command, params, { sessionId });
  return NextResponse.json(response, { status: response.ok ? 200 : 500 });
}
```

---

## Features

### Commands

The core building block. Each command has a description, typed parameters, optional return schema, and a handler:

```ts
{
  description: 'What this command does',
  params: {
    name: { type: 'string', required: true, description: 'User name' },
    count: { type: 'number', default: 10 },
    category: { type: 'string', enum: ['a', 'b', 'c'] },
    tags: { type: 'array', items: { type: 'string' } },
    options: { type: 'object', properties: { verbose: { type: 'boolean' } } },
  },
  returns: { type: 'object', properties: { id: { type: 'string' } } },
  tags: ['search', 'products'],
  auth: 'required',        // 'none' | 'required' | 'optional' | 'hidden'
  hints: {
    idempotent: true,       // Safe to retry
    sideEffects: false,     // Read-only
    estimatedMs: 200,       // Expected latency
  },
  stream: true,             // Enable SSE streaming
  rateLimit: { windowMs: 60000, maxRequests: 10, keyBy: 'ip' },
  run: async (params, context) => {
    // context.sessionId, context.auth, context.claims, context.state
    // context.emit (streaming only), context.ip, context.requestId
    return result;
  },
}
```

**Supported parameter types:** `string`, `number`, `boolean`, `object`, `array`

### Namespacing

Group related commands with dot-notation — just nest objects:

```ts
const surf = await createSurf({
  name: 'My App',
  commands: {
    cart: {
      add: { description: 'Add to cart', run: async (params) => { /* ... */ } },
      remove: { description: 'Remove from cart', run: async (params) => { /* ... */ } },
      checkout: { description: 'Checkout', run: async (params) => { /* ... */ } },
    },
    user: {
      profile: { description: 'Get profile', run: async () => { /* ... */ } },
    },
  },
});
// → Commands: cart.add, cart.remove, cart.checkout, user.profile
```

### Authentication

Define auth at the global level and per-command:

```ts
const surf = await createSurf({
  name: 'My App',
  auth: { type: 'bearer', description: 'JWT token' },
  authVerifier: async (token, command) => {
    const user = await verifyJwt(token);
    return user
      ? { valid: true, claims: { userId: user.id, role: user.role } }
      : { valid: false, reason: 'Invalid token' };
  },
  commands: {
    publicSearch: {
      description: 'Public search',
      auth: 'none',     // No auth required
      run: async (params) => { /* ... */ },
    },
    getProfile: {
      description: 'Get user profile',
      auth: 'required', // Must authenticate
      run: async (params, ctx) => {
        // ctx.claims.userId available here
      },
    },
    getRecommendations: {
      description: 'Get recommendations',
      auth: 'optional', // Personalized if authenticated
      run: async (params, ctx) => {
        if (ctx.claims) { /* personalized */ }
      },
    },
    adminDashboard: {
      description: 'Admin analytics dashboard',
      auth: 'hidden',   // Not in manifest unless authed
      run: async (params, ctx) => { /* ... */ },
    },
  },
});
```

Built-in `bearerVerifier` for simple token validation:

```ts
import { bearerVerifier } from '@surfjs/core';
const surf = await createSurf({
  authVerifier: bearerVerifier(['token-1', 'token-2']),
  // ...
});
```

#### Auth Levels

| Level | In Manifest | Requires Token | Use Case |
|-------|-------------|----------------|----------|
| `none` | ✅ Always | No | Public search, browsing |
| `optional` | ✅ Always | No (enhanced if provided) | Personalized recommendations |
| `required` | ✅ Always | Yes | User actions, writes |
| `hidden` | Only with valid token | Yes | Admin tools, internal commands |

**Hidden commands** are completely excluded from `/.well-known/surf.json` when no auth token is provided. Agents without credentials don't even know they exist. When a valid Bearer token is included in the manifest request, hidden commands appear as `auth: 'required'`.

### Rate Limiting

Global and per-command rate limits:

```ts
const surf = await createSurf({
  name: 'My App',
  rateLimit: { windowMs: 60_000, maxRequests: 100, keyBy: 'ip' }, // Global
  commands: {
    expensiveOp: {
      description: 'Resource-heavy operation',
      rateLimit: { windowMs: 60_000, maxRequests: 5, keyBy: 'auth' }, // Per-command override
      run: async (params) => { /* ... */ },
    },
  },
});
```

**`keyBy` options:** `'ip'` (default), `'session'`, `'auth'`, `'global'`

### Sessions

Stateful sessions with server-side state management:

```ts
// Server — use context.state and context.sessionId
run: async ({ sku }, ctx) => {
  const cart = ctx.state?.cart ?? [];
  cart.push(sku);
  ctx.state = { ...ctx.state, cart };
  return { cartSize: cart.length };
}

// Client — start/use/end sessions
const session = await client.startSession();
await session.execute('addToCart', { sku: 'SHOE-001' });
await session.execute('addToCart', { sku: 'HAT-002' });
const cart = await session.execute('getCart');
await session.end();
```

### Pipelines

Execute multiple commands in a single HTTP round-trip:

```ts
const results = await client.pipeline([
  { command: 'search', params: { query: 'shoes' }, as: 'results' },
  { command: 'getProduct', params: { id: '$results[0].id' } },
  { command: 'addToCart', params: { sku: '$results[0].sku' } },
]);
// results.results → [{ command, ok, result }, ...]
```

Server-side pipeline options:

```ts
// POST /surf/pipeline
{
  "steps": [...],
  "sessionId": "optional-session",
  "continueOnError": true  // Continue executing steps even if one fails
}
```

### SSE Streaming

For long-running commands that produce incremental output:

**Server:**
```ts
const surf = await createSurf({
  name: 'AI Writer',
  commands: {
    generate: {
      description: 'Generate text with streaming',
      params: { prompt: { type: 'string', required: true } },
      stream: true,
      run: async ({ prompt }, { emit }) => {
        for (const token of generateTokens(prompt)) {
          emit!({ token });    // → SSE chunk event
          await sleep(50);
        }
        return { done: true }; // → SSE done event
      },
    },
  },
});
```

**Client:**
```ts
const response = await fetch('https://example.com/surf/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ command: 'generate', params: { prompt: 'Hello' }, stream: true }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();
// SSE format: data: {"type":"chunk","data":{...}}\n\n
// Final:      data: {"type":"done","result":{...}}\n\n
```

### WebSocket Transport

For real-time bidirectional communication:

**Server:**
```ts
import { createServer } from 'http';
const server = createServer(app);
surf.wsHandler(server); // Requires the 'ws' package
server.listen(3000);
```

**Client:**
```ts
const ws = await client.connect(); // Connects to ws://host/surf/ws
ws.on('orderUpdate', (data) => console.log('Order updated:', data));
const result = await ws.execute('search', { query: 'shoes' });
await ws.startSession();
await ws.endSession();
ws.close();
```

### Window Runtime (In-Browser)

For browser-based agents operating within the page:

**Server — inject the runtime:**
```ts
const script = surf.browserScript(); // Returns <script> with window.__surf__
const bridge = surf.browserBridge(); // Returns bridge code for in-page agents
```

**Client — use from browser:**
```ts
import { WindowTransport } from '@surfjs/client';

const transport = new WindowTransport();
await transport.connect(); // Uses window.__surf__
const manifest = transport.discover();
const result = await transport.execute('search', { query: 'shoes' });
transport.on('event', (data) => console.log(data));
```

### Middleware

Composable middleware pipeline for cross-cutting concerns:

```ts
import type { SurfMiddleware } from '@surfjs/core';

const logger: SurfMiddleware = async (ctx, next) => {
  console.log(`→ ${ctx.command}`, ctx.params);
  const start = Date.now();
  await next();
  console.log(`← ${ctx.command} (${Date.now() - start}ms)`);
};

const rateLimiter: SurfMiddleware = async (ctx, next) => {
  if (isRateLimited(ctx.context.ip)) {
    ctx.error = { ok: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } };
    return;
  }
  await next();
};

surf.use(logger);
surf.use(rateLimiter);
```

Middleware has access to `ctx.command`, `ctx.params`, `ctx.context` (session, auth, IP), and can set `ctx.result` or `ctx.error` to short-circuit.

### Reusable Types

Define shared types referenced across commands with `$ref`:

```ts
const surf = await createSurf({
  name: 'My App',
  types: {
    Product: {
      type: 'object',
      description: 'A product in the catalog',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        price: { type: 'number' },
      },
    },
  },
  commands: {
    search: {
      description: 'Search products',
      returns: { type: 'array', items: { $ref: '#/types/Product' } },
      run: async () => { /* ... */ },
    },
  },
});
```

---

## Event Scoping

Surf events support **three delivery scopes** — a key security feature for multi-tenant / multi-session environments:

| Scope | Behavior |
|---|---|
| `session` (default) | Only delivered to the session that triggered it |
| `global` | Delivered to all subscribers (system announcements) |
| `broadcast` | Delivered to all connected clients |

```ts
const surf = await createSurf({
  name: 'My App',
  events: {
    'order.updated': {
      description: 'Order status changed',
      scope: 'session',  // Only the user who placed the order sees updates
      data: { orderId: { type: 'string' }, status: { type: 'string' } },
    },
    'maintenance.scheduled': {
      description: 'System maintenance announcement',
      scope: 'global',   // Everyone sees this
      data: { message: { type: 'string' }, scheduledAt: { type: 'string' } },
    },
  },
  commands: { /* ... */ },
});

// Server-side: emit with session context
surf.events.on('order.updated', (data) => { /* server-side listener */ });
surf.emit('order.updated', { orderId: '123', status: 'shipped' });

// Session cleanup on disconnect
surf.events.removeSession(sessionId);
```

---

## CLI

The `@surfjs/cli` package provides terminal tools for inspecting and testing Surf-enabled sites.

```bash
npm install -g @surfjs/cli
```

### `surf inspect <url>`

Fetch the manifest and pretty-print all available commands:

```bash
$ surf inspect https://acme-store.com

🏄 Acme Store (Surf v0.1.0)
   E-commerce store with 50,000+ products

   5 commands available:

   search(query: string, maxPrice?: number, category?: string)
   Search products by keyword

   cart.add(sku: string, qty?: number) 🔐
   Add item to cart
```

Use `--verbose` to show full parameter schemas and hints.

### `surf test <url> <command>`

Execute a command interactively. Missing required params are prompted:

```bash
$ surf test https://acme-store.com search --query "wireless headphones" --maxPrice 100

   Executing search on https://acme-store.com...

   OK

   [
     { "id": "1", "name": "Wireless Headphones", "price": 79.99 }
   ]

   ⏱  45ms execute / 312ms total
```

### `surf ping <url>`

Check if a site is Surf-enabled:

```bash
$ surf ping https://acme-store.com
✅ https://acme-store.com is Surf-enabled (23ms)
```

### CLI Flags

| Flag | Description |
|---|---|
| `--json` | Machine-readable JSON output |
| `--auth <token>` | Bearer token for authenticated commands |
| `--verbose` | Show full parameter schemas and hints (inspect) |

---

## DevUI

`@surfjs/devui` provides an interactive browser-based inspector for exploring and testing your Surf commands during development.

```ts
import { createSurf } from '@surfjs/core';
import { createDevUI } from '@surfjs/devui';

const surf = await createSurf({ name: 'My App', commands: { /* ... */ } });
const devui = createDevUI(surf, { port: 4242 });

// Standalone server
const { url } = await devui.start();
console.log(`DevUI at ${url}`);  // → http://localhost:4242/__surf

// Or as Express middleware
app.use(devui.middleware());  // Mounts at /__surf
```

**Options:**

| Option | Default | Description |
|---|---|---|
| `port` | `4242` | Port for standalone server |
| `host` | `'localhost'` | Host to bind to |
| `path` | `'/__surf'` | Mount path prefix |
| `title` | Manifest name | Override the UI title |

The DevUI features:
- Command sidebar with search/filter and namespace grouping
- Parameter form with type-aware inputs (text, number, checkbox, select for enums, JSON editor for objects/arrays)
- One-click execution with auth token support
- Request log with syntax-highlighted JSON and timing
- Keyboard shortcuts: `/` to search, `⌘Enter` to execute

---

## API Reference

### `createSurf(config): Promise<SurfInstance>`

The main entry point. Returns a `SurfInstance`.

**`SurfConfig`:**

| Field | Type | Description |
|---|---|---|
| `name` | `string` | **Required.** Service name (shown in manifest and DevUI) |
| `description` | `string?` | Service description |
| `version` | `string?` | Service version |
| `baseUrl` | `string?` | Base URL for the service |
| `auth` | `AuthConfig?` | Auth configuration (`{ type: 'bearer' \| 'apiKey' \| 'oauth2' \| 'none' }`) |
| `commands` | `Record<string, CommandDefinition \| CommandGroup>` | **Required.** Command definitions (supports nesting) |
| `events` | `Record<string, EventDefinition>?` | Event definitions with scope |
| `types` | `Record<string, TypeDefinition>?` | Reusable type definitions (referenced via `$ref`) |
| `middleware` | `SurfMiddleware[]?` | Middleware pipeline |
| `authVerifier` | `AuthVerifier?` | Auto-installs auth enforcement middleware |
| `rateLimit` | `RateLimitConfig?` | Global rate limit |
| `validateReturns` | `boolean?` | Validate return values against `returns` schema |
| `strict` | `boolean?` | Enable strict mode (implies `validateReturns`) |

### `SurfInstance`

| Method | Returns | Description |
|---|---|---|
| `manifest()` | `SurfManifest` | Get the generated manifest object |
| `manifestHandler()` | `HttpHandler` | HTTP handler for `GET /.well-known/surf.json` |
| `httpHandler()` | `HttpHandler` | HTTP handler for `POST /surf/execute` |
| `middleware()` | `HttpHandler` | Express/Connect middleware (manifest + execute + pipeline + sessions) |
| `wsHandler(server)` | `void` | Attach WebSocket transport (requires `ws` package) |
| `browserScript()` | `string` | Generate `window.__surf__` runtime script |
| `browserBridge()` | `string` | Generate in-page bridge for browser agents |
| `use(middleware)` | `void` | Add middleware to the pipeline |
| `emit(event, data)` | `void` | Emit an event to subscribers |
| `events` | `EventBus` | Access the event bus directly |
| `sessions` | `SessionStore` | Access the session store |
| `commands` | `CommandRegistry` | Access the command registry |

### Error Codes

| Code | HTTP | Meaning |
|---|---|---|
| `UNKNOWN_COMMAND` | 404 | Command not found in manifest |
| `INVALID_PARAMS` | 400 | Missing/wrong params |
| `AUTH_REQUIRED` | 401 | Authentication required but not provided |
| `AUTH_FAILED` | 403 | Token invalid or expired |
| `SESSION_EXPIRED` | 410 | Session no longer valid |
| `RATE_LIMITED` | 429 | Too many requests (check `Retry-After` header) |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `NOT_SUPPORTED` | 501 | Feature/transport not available |

---

## Security

### ⚠️ Only expose what's already public

When adding Surf to your website, commands should **only mirror actions that regular users can already perform** through the public UI:

- ✅ Search products, browse content, read public data
- ✅ Add to cart, submit forms (with auth)
- ❌ Internal APIs, admin endpoints, database queries
- ❌ Backend services not already exposed to end users

**Rule of thumb:** If a user can't do it from the browser without special access, it shouldn't be an unauthenticated Surf command. Use `auth: 'required'` for any command that modifies data or performs actions on behalf of a user. For admin or internal tools, use `auth: 'hidden'` to keep them out of the public manifest entirely.

### Design for zero prior knowledge

Agents arrive with **no context** about your site — no IDs, slugs, or internal references. Design commands so agents can explore from scratch:

- ✅ `search("headphones")` → returns items with IDs → `product.get("WH-100")`
- ✅ `articles.list()` → returns slugs → `articles.get("my-post")`
- ❌ `article.get(slug)` with no way to discover valid slugs

**Good pattern:** search/list → get details → take action. Never require an ID without a discovery path to find it.

### Built-in protections

Surf includes multiple layers of security by default:

- **Session isolation** — Session state is isolated per session ID. One user cannot access another's state.
- **Event scoping** — Events default to `session` scope. A user only receives events they triggered, unless explicitly configured as `global` or `broadcast`.
- **Per-command auth** — Each command can require, optionally accept, or skip authentication independently.
- **Auth verification** — The `authVerifier` runs before command execution, populating `context.claims` for downstream use.
- **Rate limiting** — Global and per-command rate limits by IP, session, auth identity, or globally.
- **Parameter validation** — All incoming parameters are validated against their declared schemas before reaching the handler.
- **Return validation** — In strict mode, return values are also validated against the `returns` schema.
- **CORS headers** — All responses include `Access-Control-Allow-Origin: *` for cross-origin agent access.
- **ETag caching** — Manifest responses include checksums for efficient caching.

---

## Discovery

Agents find your Surf manifest through multiple mechanisms:

1. **`/.well-known/surf.json`** (recommended) — Standard discovery endpoint, fetched first
2. **HTML `<meta name="surf">` tag** — Fallback for sites that can't serve well-known paths
3. **`window.__surf__`** — In-browser runtime for browser-based agents
4. **`llms.txt`** — Reference in your site's `/llms.txt` for LLM-based agents
5. **`robots.txt`** — Agent-friendly hints (`Allow: /.well-known/surf.json`)

---

## Transports

Same commands, three delivery mechanisms:

| Transport | Use Case | Latency |
|---|---|---|
| **HTTP** | Default. RESTful request/response. Works everywhere. | ~200ms |
| **WebSocket** | Real-time bidirectional. Events, live updates. | ~10ms |
| **Window Runtime** | Browser-based agents via `window.__surf__`. | ~1ms |

---

## Protocol

The full protocol specification is at **[SPEC.md](./SPEC.md)** — language-agnostic, implement it in Python, Go, Ruby, or any language.

## Examples

See the [`examples/`](./examples) directory for complete, runnable examples:

- **[Express](./examples/express)** — Store backend with 5 commands
- **[Fastify](./examples/fastify)** — Same store, Fastify adapter
- **[Hono](./examples/hono)** — Same store, Hono adapter
- **[Next.js](./examples/nextjs)** — App Router API integration
- **[Agent Client](./examples/agent-client)** — Discover + execute + pipeline + sessions
- **[Streaming](./examples/streaming)** — SSE streaming server and client

## Contributing

We'd love your help! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

```bash
# Clone and install
git clone https://github.com/hauselabs/surf.git
cd surf
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Type check
pnpm typecheck
```

## License

[MIT](./LICENSE) © agent-hause / hause.co contributors
