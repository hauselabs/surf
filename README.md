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

## Installation

```bash
# Core server-side and protocol logic
npm install @surfjs/core

# For React-based browser execution
npm install @surfjs/react @surfjs/web
```

## Quick Start

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

## Browser-Side Execution

Commands don't have to go through a server. With `@surfjs/web` and `useSurfCommands`, handlers run **locally in the browser** — modifying UI state directly. Instant. No HTTP roundtrip.

```tsx
import { useSurfCommands } from '@surfjs/react'

function MyApp() {
  useSurfCommands({
    'canvas.addCircle': {
      mode: 'local',
      run: (params) => {
        addCircleToCanvas(params)
        return { ok: true }
      }
    },
    'sidebar.toggle': {
      mode: 'local',
      run: ({ open }) => {
        setSidebarOpen(open)
        return { ok: true }
      }
    }
  })
}

// Agent runs: await window.surf.execute('canvas.addCircle', { x: 200, radius: 50 })
```

Handlers are registered on mount, cleaned up on unmount. The `window.surf` dispatcher routes to the local handler first — falling back to the server if no handler is found.

## Execution Modes

| Mode | Where it runs | Use case |
|------|--------------|----------|
| `'local'` | Browser only | UI state changes — no persistence needed |
| `'sync'` | Server | Immediate response for database/API actions |

## License

MIT © [Surf](https://surf.codes)