# @surfjs/devui

> Interactive browser-based dev inspector for Surf-enabled apps.

```bash
npm install @surfjs/devui
```

## Quick Start

```ts
import { createSurf } from '@surfjs/core';
import { createDevUI } from '@surfjs/devui';

const surf = createSurf({
  name: 'My App',
  commands: { /* ... */ },
});

const devui = createDevUI(surf, { port: 4242 });
const { url } = await devui.start();
console.log(`DevUI at ${url}`); // → http://localhost:4242/__surf
```

## Usage

### Standalone Server

Runs its own HTTP server that also proxies Surf endpoints:

```ts
const devui = createDevUI(surf, { port: 4242 });
const { url } = await devui.start();
// DevUI at http://localhost:4242/__surf
// Manifest at http://localhost:4242/.well-known/surf.json
// Execute at http://localhost:4242/surf/execute

await devui.stop(); // Graceful shutdown
```

### Express Middleware

Mount alongside your existing Express app:

```ts
import express from 'express';

const app = express();
app.use(express.json());
app.use(surf.middleware());
app.use(devui.middleware()); // Mounts at /__surf
app.listen(3000);
// → DevUI at http://localhost:3000/__surf
```

## Options

```ts
interface DevUIOptions {
  port?: number;    // Port for standalone server (default: 4242)
  host?: string;    // Host to bind to (default: 'localhost')
  title?: string;   // Override UI title (default: manifest name)
  path?: string;    // Mount path prefix (default: '/__surf')
}
```

## Features

- **Command sidebar** — All commands listed with search/filter and namespace grouping
- **Parameter form** — Type-aware inputs: text, number, checkbox, select for enums, JSON editor for objects/arrays
- **One-click execution** — Execute commands with optional Bearer token auth
- **Request log** — Syntax-highlighted JSON request/response with timing
- **Keyboard shortcuts** — `/` to focus search, `⌘Enter` to execute, `Esc` to blur
- **Auth support** — Bearer token input in the header for testing authenticated commands
- **Auth badges** — Visual indicators for `required` and `optional` auth commands
- **Command hints** — Tags for idempotent, side-effects, estimated latency
- **Scandinavian design** — Clean, minimal UI with Inter font and generous whitespace

## API

### `createDevUI(surf: SurfInstance, options?: DevUIOptions): DevUI`

```ts
interface DevUI {
  start(): Promise<{ url: string }>;     // Start standalone server
  middleware(): (req, res) => void;       // Express-compatible middleware
  stop(): Promise<void>;                  // Stop standalone server
}
```

## Exports

```ts
import { createDevUI } from '@surfjs/devui';
import type { DevUI, DevUIOptions } from '@surfjs/devui';
```

## License

[MIT](../../LICENSE)
