<div align="center">

# @surfjs/client

**The agent-side SDK for Surf-enabled websites.**

[![npm](https://img.shields.io/npm/v/@surfjs/client?color=0057FF&label=npm)](https://www.npmjs.com/package/@surfjs/client)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/hauselabs/surf/blob/main/LICENSE)

</div>

---

Discover, connect, and execute commands on any [Surf](https://surf.codes)-enabled website. Built for AI agents and automation — no scraping, no vision models, just typed commands.

Part of the **[Surf.js](https://github.com/hauselabs/surf)** ecosystem. See [@surfjs/core](https://www.npmjs.com/package/@surfjs/core) for the server-side library.

```bash
npm install @surfjs/client
```

## Quick Start

```ts
import { SurfClient } from '@surfjs/client';

// Discover and connect
const client = await SurfClient.discover('https://example.com');

// List available commands
console.log(client.commands());

// Execute a command
const results = await client.execute('search', { query: 'shoes' });
```

## API

### `SurfClient.discover(url, options?): Promise<SurfClient>`

Discover a Surf-enabled site by fetching its manifest. Tries `/.well-known/surf.json` first, falls back to HTML `<meta name="surf">` tag.

```ts
const client = await SurfClient.discover('https://example.com', {
  auth: 'bearer-token',
  retry: { maxAttempts: 3, backoffMs: 500, backoffMultiplier: 2 },
  cache: { ttlMs: 30000, maxSize: 100 },
  discoverTimeout: 5000,
  fetch: customFetch,
});
```

### `SurfClient.fromManifest(manifest, options): SurfClient`

Create a client with a pre-loaded manifest (skip discovery):

```ts
const client = SurfClient.fromManifest(manifest, { baseUrl: 'https://example.com' });
```

### SurfClientOptions

```ts
interface SurfClientOptions {
  baseUrl: string;
  auth?: string;                   // Bearer token
  fetch?: typeof globalThis.fetch; // Custom fetch implementation
  retry?: RetryConfig;
  cache?: CacheConfig;
  discoverTimeout?: number;        // Discovery timeout in ms (default: 5000)
}
```

### Instance Methods

#### `client.commands(): Record<string, ManifestCommand>`

Returns all available commands from the manifest.

#### `client.command(name): ManifestCommand | undefined`

Get a specific command definition.

#### `client.execute(command, params?): Promise<unknown>`

Execute a command via HTTP. Respects retry and cache configuration.

**Note:** The server returns `{ ok: true, result: <data> }` but `execute()` unwraps the envelope and returns `<data>` directly. Errors throw a `SurfClientError` instead of returning `{ ok: false, error }`. This is by design — the SDK provides a clean calling convention while the protocol uses an envelope for transport.

```ts
// Server responds: { ok: true, result: [{ name: "Shoes", price: 99 }] }
// execute() returns: [{ name: "Shoes", price: 99 }]
const products = await client.execute('search', { query: 'shoes', maxPrice: 100 });
```

Cache behavior:
- Commands with `hints.sideEffects: true` bypass the cache
- Use `client.clearCache()` or `client.clearCache('commandName')` to invalidate

#### `client.pipeline(steps, options?): Promise<PipelineResponse>`

Execute multiple commands in a single HTTP round-trip:

```ts
const result = await client.pipeline([
  { command: 'search', params: { query: 'shoes' }, as: 'results' },
  { command: 'getProduct', params: { id: '$results[0].id' } },
  { command: 'addToCart', params: { sku: '$results[0].sku' } },
], { sessionId: 'optional', continueOnError: true });

result.results.forEach(step => {
  console.log(`${step.command}: ${step.ok ? '✅' : '❌'}`, step.result ?? step.error);
});
```

#### `client.typed<T>(): TypedClient<T>`

Returns a typed proxy client with full TypeScript inference:

```ts
interface Product { id: string; name: string; price: number; }

const typed = client.typed<{
  search: { params: { query: string; maxPrice?: number }; result: Product[] };
  addToCart: { params: { sku: string; quantity?: number }; result: { added: boolean } };
}>();

const products = await typed.search({ query: 'shoes' }); // → Product[]
await typed.addToCart({ sku: 'SHOE-001' });               // → { added: boolean }
```

#### `client.startSession(): Promise<SurfSession>`

Start a stateful session:

```ts
const session = await client.startSession();
console.log(session.id);      // Session ID
console.log(session.state);   // Current state (updated after each execute)

await session.execute('addToCart', { sku: 'SHOE-001' });
await session.execute('addToCart', { sku: 'HAT-002' });
const cart = await session.execute('getCart');
await session.end();
```

#### `client.connect(): Promise<WebSocketTransport>`

Connect via WebSocket for real-time interaction:

```ts
const ws = await client.connect();
ws.on('orderUpdate', (data) => console.log(data));
const result = await ws.execute('search', { query: 'shoes' });
ws.close();
```

#### `client.disconnect(): void`

Close the WebSocket connection if connected.

#### `client.checkForUpdates(): Promise<UpdateCheckResult>`

Re-fetch the manifest and check if the checksum changed:

```ts
const { changed, checksum, manifest } = await client.checkForUpdates();
if (changed) console.log('Manifest updated!', manifest);
```

#### `client.clearCache(command?): void`

Clear the response cache. Pass a command name to clear only that command's cache.

### `client.manifest: SurfManifest`

The discovered manifest object (read-only).

---

## Transports

### HttpTransport

Default transport — used by `SurfClient.execute()` internally.

```ts
import { HttpTransport } from '@surfjs/client';

const http = new HttpTransport({
  baseUrl: 'https://example.com',
  auth: 'token',
  fetch: globalThis.fetch,
});

const response = await http.execute('search', { query: 'shoes' }, sessionId);
await http.startSession();
await http.endSession(sessionId);
```

### WebSocketTransport

Real-time bidirectional transport:

```ts
import { WebSocketTransport } from '@surfjs/client';

const ws = new WebSocketTransport();
await ws.connect('ws://example.com/surf/ws', 'auth-token');

// Execute commands
const response = await ws.execute('search', { query: 'shoes' });

// Subscribe to events
const unsub = ws.on('orderUpdate', (data) => console.log(data));

// Sessions
const sessionId = await ws.startSession();
await ws.endSession();

// Status
console.log(ws.connected); // true/false

ws.close();
```

### WindowTransport

For browser-based agents using `window.__surf__`:

```ts
import { WindowTransport } from '@surfjs/client';

const win = new WindowTransport();
await win.connect();               // Waits for window.__surf__ or surf:ready event

const manifest = win.discover();
const result = await win.execute('search', { query: 'shoes' });
win.on('event', (data) => {});
win.authenticate('token');

console.log(win.connected); // true/false
```

---

## Discovery

```ts
import { discoverManifest } from '@surfjs/client';

const manifest = await discoverManifest('https://example.com', fetch, 5000);
// Tries /.well-known/surf.json → HTML <meta name="surf"> fallback
```

---

## Retry Configuration

```ts
interface RetryConfig {
  maxAttempts: number;         // Max retry attempts (default: 3)
  backoffMs: number;           // Initial backoff in ms (default: 500)
  backoffMultiplier: number;   // Exponential multiplier (default: 2)
  retryOn?: number[];          // HTTP codes to retry (default: [429, 502, 503, 504])
}
```

## Cache Configuration

```ts
interface CacheConfig {
  ttlMs: number;    // Cache TTL in milliseconds
  maxSize: number;  // Maximum cached entries
}
```

---

## Error Handling

```ts
import { SurfClientError } from '@surfjs/client';

try {
  await client.execute('nonexistent');
} catch (e) {
  if (e instanceof SurfClientError) {
    console.log(e.code);        // 'UNKNOWN_COMMAND'
    console.log(e.message);     // Human-readable message
    console.log(e.statusCode);  // HTTP status (if available)
    console.log(e.retryAfter);  // Seconds to wait (for RATE_LIMITED)
  }
}
```

---

## Exports

```ts
import {
  SurfClient,
  SurfClientError,
  discoverManifest,
  HttpTransport,
  WebSocketTransport,
  WindowTransport,
  // Types
  type SurfManifest, type ManifestCommand, type SurfClientOptions,
  type SurfSession, type UpdateCheckResult,
  type ParamSchema, type ParamType, type TypeRef, type CommandHints,
  type AuthConfig, type EventDefinition, type TypeDefinition,
  type SurfErrorCode, type ExecuteResponse, type ErrorResponse, type SurfResponse,
  type RetryConfig, type CacheConfig,
  type TypedCommands, type TypedClient,
  type PipelineStep, type PipelineStepResult, type PipelineResponse,
} from '@surfjs/client';
```

## License

[MIT](../../LICENSE)
