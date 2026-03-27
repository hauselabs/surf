<div align="center">

# @surfjs/next

**Next.js adapter for [Surf.js](https://surf.codes) — App Router, Pages Router, and edge-compatible.**

[![npm](https://img.shields.io/npm/v/@surfjs/next?color=0057FF&label=npm)](https://www.npmjs.com/package/@surfjs/next)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/hauselabs/surf/blob/main/LICENSE)
[![GitHub](https://img.shields.io/github/stars/hauselabs/surf?style=social)](https://github.com/hauselabs/surf)

[Website](https://surf.codes) · [Docs](https://surf.codes/docs/adapters/next) · [GitHub](https://github.com/hauselabs/surf)

</div>

---

Mount a Surf command API in your Next.js app in minutes. Supports **App Router** (route handlers, edge runtime), **Pages Router** (API routes), and the standard `/.well-known/surf.json` discovery path via a Next.js middleware rewrite.

Part of the **[Surf.js](https://github.com/hauselabs/surf)** ecosystem. See [@surfjs/core](https://www.npmjs.com/package/@surfjs/core) for the server-side library.

## Installation

```bash
npm install @surfjs/next @surfjs/core
# or
pnpm add @surfjs/next @surfjs/core
```

## Quick Start (App Router)

### 1. Create a catch-all route handler

```ts
// app/api/surf/[...slug]/route.ts
import { createSurf } from '@surfjs/core';
import { createSurfRouteHandler } from '@surfjs/next';

const surf = await createSurf({
  name: 'My App',
  commands: {
    hello: {
      description: 'Say hello',
      params: { name: { type: 'string', required: true } },
      run: ({ name }) => ({ message: `Hello, ${name}!` }),
    },
  },
});

export const { GET, POST } = createSurfRouteHandler(surf);
```

This single handler serves all Surf routes:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/surf/.well-known/surf.json` | Surf manifest |
| `POST` | `/api/surf/surf/execute` | Execute a command |
| `POST` | `/api/surf/surf/pipeline` | Execute a pipeline |
| `POST` | `/api/surf/surf/session/start` | Start a session |
| `POST` | `/api/surf/surf/session/end` | End a session |

### 2. Enable standard discovery (recommended)

Add the middleware rewrite so agents can find your manifest at `/.well-known/surf.json`:

```ts
// middleware.ts
import { surfMiddleware } from '@surfjs/next/middleware';

export default surfMiddleware();

// Only run on the discovery path
export const config = { matcher: ['/.well-known/surf.json'] };
```

This rewrites `GET /.well-known/surf.json` → `GET /api/surf/.well-known/surf.json` — no extra route needed.

### 3. Done

Your app is now Surf-enabled:

```bash
curl https://myapp.com/.well-known/surf.json
curl -X POST https://myapp.com/api/surf/surf/execute \
  -H "Content-Type: application/json" \
  -d '{"command":"hello","params":{"name":"Claude"}}'
```

---

## Pages Router

Create a catch-all API route:

```ts
// pages/api/surf/[...slug].ts
import { createSurf } from '@surfjs/core';
import { createSurfApiHandler } from '@surfjs/next/pages';

const surf = await createSurf({
  name: 'My App',
  commands: {
    hello: {
      description: 'Say hello',
      params: { name: { type: 'string', required: true } },
      run: ({ name }) => ({ message: `Hello, ${name}!` }),
    },
  },
});

export default createSurfApiHandler(surf);
```

Add the same `middleware.ts` as above for standard discovery.

---

## Custom Base Path

If your Surf route is not at `/api/surf`, pass `basePath`:

```ts
// App Router — mounted at /actions/surf/[...slug]/route.ts
export const { GET, POST } = createSurfRouteHandler(surf, {
  basePath: '/actions/surf',
});
```

```ts
// middleware.ts — rewrite to matching base path
import { surfMiddleware } from '@surfjs/next/middleware';

export default surfMiddleware({ basePath: '/actions/surf' });
export const config = { matcher: ['/.well-known/surf.json'] };
```

---

## Edge Runtime

The App Router handler (`createSurfRouteHandler`) uses only Web Standard APIs — no Node.js. Opt into the edge runtime with:

```ts
// app/api/surf/[...slug]/route.ts
export const runtime = 'edge';

export const { GET, POST } = createSurfRouteHandler(surf);
```

> **Note:** Edge runtime does not support `@surfjs/core`'s WebSocket transport. For WebSocket support, use the Node.js runtime.

---

## Authentication

```ts
import { createSurf, bearerVerifier } from '@surfjs/core';
import { createSurfRouteHandler } from '@surfjs/next';

const surf = await createSurf({
  name: 'My App',
  auth: { type: 'bearer', description: 'API key' },
  authVerifier: bearerVerifier(['my-secret-token']),
  commands: {
    private: {
      description: 'Protected command',
      auth: 'required',
      run: (params, ctx) => ({ userId: ctx.claims }),
    },
  },
});

export const { GET, POST } = createSurfRouteHandler(surf);
```

The handler automatically extracts Bearer tokens from the `Authorization` header and passes them to your `authVerifier`.

---

## Composing with Existing Middleware

The `surfMiddleware` utility composes cleanly with other Next.js middleware:

```ts
// middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { surfMiddleware } from '@surfjs/next/middleware';

const surf = surfMiddleware();

export function middleware(request: NextRequest) {
  // Run Surf rewrite for the discovery path
  if (request.nextUrl.pathname === '/.well-known/surf.json') {
    return surf(request);
  }
  // Your existing middleware logic
  return NextResponse.next();
}

export const config = { matcher: ['/.well-known/surf.json', '/api/:path*'] };
```

---

## API Reference

### `createSurfRouteHandler(surf, options?)` — App Router

Returns `{ GET, POST }` route handlers for a Next.js catch-all route.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `basePath` | `string` | `'/api/surf'` | The base path where the route is mounted |

### `createSurfApiHandler(surf, options?)` — Pages Router

Returns a single API route handler for a Next.js catch-all API route.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `basePath` | `string` | `'/api/surf'` | The base path where the route is mounted |

### `surfMiddleware(options?)` — Next.js Middleware

Returns a Next.js middleware function that rewrites `/.well-known/surf.json` to your Surf API route.

Import from `@surfjs/next/middleware`.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `basePath` | `string` | `'/api/surf'` | The Surf API route base path to rewrite to |

### Utilities

These are re-exported from `@surfjs/next` for advanced use:

| Export | Description |
|--------|-------------|
| `extractAuth(header)` | Extract Bearer token from Authorization header |
| `extractIp(forwarded, realIp)` | Extract client IP from headers |
| `extractSessionId(body)` | Extract `sessionId` from a request body |
| `getErrorStatus(code)` | Map a SurfErrorCode to an HTTP status code |

---

## Features

- ✅ **App Router** — route handlers with edge runtime support
- ✅ **Pages Router** — classic API routes with Node.js runtime
- ✅ **Standard discovery** — `/.well-known/surf.json` via middleware rewrite
- ✅ **SSE streaming** — for long-running commands
- ✅ **Session management** — start, execute, end sessions
- ✅ **Pipeline execution** — multi-command round-trips
- ✅ **Auth extraction** — Bearer token from `Authorization` header
- ✅ **IP extraction** — `x-forwarded-for` / `x-real-ip`
- ✅ **ETag caching** — efficient manifest responses
- ✅ **CORS headers** — cross-origin agent access
- ✅ **Error mapping** — consistent SurfErrorCode → HTTP status

---

## Full Docs

[surf.codes/docs/adapters/next](https://surf.codes/docs/adapters/next)

## License

MIT
