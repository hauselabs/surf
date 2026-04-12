# Surf.js + Fastify Example

A simple store API demonstrating Surf.js with [Fastify](https://fastify.dev).

## Quick Start

```bash
pnpm install
pnpm start
```

## How It Works

The `fastifyPlugin()` adapter registers all Surf routes as native Fastify handlers:

```ts
import Fastify from 'fastify'
import { createSurf } from '@surfjs/core'
import { fastifyPlugin } from '@surfjs/core/fastify'

const surf = await createSurf({ name: 'My API', commands: { ... } })
const app = Fastify()

app.register(fastifyPlugin(surf))
app.listen({ port: 3000 })
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
