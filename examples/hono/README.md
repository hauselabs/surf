# Surf.js + Hono Example

A simple store API demonstrating Surf.js with [Hono](https://hono.dev).

## Quick Start

```bash
pnpm install
pnpm start
```

## How It Works

The `honoApp()` adapter creates a Hono sub-app with all Surf routes:

```ts
import { Hono } from 'hono'
import { createSurf } from '@surfjs/core'
import { honoApp } from '@surfjs/core/hono'

const surf = await createSurf({ name: 'My API', commands: { ... } })
const app = new Hono()

app.route('/', await honoApp(surf))
```

### Cloudflare Workers / Edge

```ts
import { createSurf } from '@surfjs/core'
import { honoMiddleware } from '@surfjs/core/hono'

const surf = await createSurf({ name: 'My API', commands: { ... } })
export default { fetch: await honoMiddleware(surf) }
```

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/.well-known/surf.json` | Manifest (with ETag/304) |
| POST | `/surf/execute` | Execute a command |
| POST | `/surf/pipeline` | Execute a pipeline |
| POST | `/surf/session/start` | Start a session |
| POST | `/surf/session/end` | End a session |

## Test

```bash
# Get manifest
curl http://localhost:3000/.well-known/surf.json

# Search products
curl -X POST http://localhost:3000/surf/execute \
  -H "Content-Type: application/json" \
  -d '{"command": "search", "params": {"query": "shoes"}}'
```
