# @surfjs/next

Next.js adapter for [Surf.js](https://surf.codes) — supports both **App Router** (route handlers) and **Pages Router** (API routes).

## Installation

```bash
pnpm add @surfjs/next @surfjs/core
```

## App Router (Recommended)

Create a catch-all route handler at `app/api/surf/[...slug]/route.ts`:

```ts
import { createSurf } from '@surfjs/core';
import { createSurfRouteHandler } from '@surfjs/next';

const surf = createSurf({
  name: 'my-app',
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

The handler serves:
- `GET /api/surf/.well-known/surf.json` — Surf manifest
- `POST /api/surf/surf/execute` — Execute commands
- `POST /api/surf/surf/pipeline` — Execute pipelines
- `POST /api/surf/surf/session/start` — Start sessions
- `POST /api/surf/surf/session/end` — End sessions

### Edge Runtime

The App Router handler is fully edge-compatible — no Node.js APIs are used. Add the edge runtime directive if desired:

```ts
export const runtime = 'edge';
```

## Pages Router

Create a catch-all API route at `pages/api/surf/[...slug].ts`:

```ts
import { createSurf } from '@surfjs/core';
import { createSurfApiHandler } from '@surfjs/next/pages';

const surf = createSurf({
  name: 'my-app',
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

## Features

- ✅ App Router (route handlers) with edge runtime support
- ✅ Pages Router (API routes) with Node.js runtime
- ✅ SSE streaming for both routers
- ✅ Session management
- ✅ Pipeline execution
- ✅ Bearer token auth extraction
- ✅ Client IP extraction (`x-forwarded-for`, `x-real-ip`)
- ✅ ETag caching for manifest
- ✅ CORS headers
- ✅ Consistent error code → HTTP status mapping

## License

MIT
