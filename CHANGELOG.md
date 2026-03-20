# Changelog

## 0.1.0 (2025-03-20)

Initial release. 🏄

### @surfjs/core

- `createSurf()` — main entry point for defining Surf-enabled applications
- **Command system** — typed commands with parameter validation, enums, defaults
- **Manifest generation** — auto-generated `surf.json` with checksum and schema
- **HTTP transport** — `POST /surf/execute` with full request/response protocol
- **WebSocket transport** — real-time bidirectional communication via `ws`
- **Window runtime** — `window.__surf__` for browser-based agents
- **SSE streaming** — stream responses for long-running commands
- **Pipeline execution** — batch multiple commands in a single request with `$alias` references
- **Sessions** — stateful sessions with in-memory store
- **Authentication** — bearer token verification with per-command auth levels
- **Middleware** — composable middleware pipeline
- **Rate limiting** — global and per-command rate limits (by IP, session, auth)
- **Namespacing** — dot-notation command grouping via `group()` helper
- **Validation** — parameter and return value validation against schemas
- **Type references** — shared type definitions with `$ref` support
- **Events** — event bus for real-time event broadcasting

### @surfjs/client

- `SurfClient.discover()` — auto-discover surf.json from any URL
- `SurfClient.fromManifest()` — create client from pre-loaded manifest
- `client.execute()` — execute commands via HTTP
- `client.pipeline()` — batch command execution
- `client.typed()` — TypeScript-inferred typed command proxy
- `client.startSession()` — stateful session management
- `client.connect()` — WebSocket real-time connection
- `client.checkForUpdates()` — manifest change detection
- **Response caching** — configurable TTL and max-size cache
- **Retry with backoff** — exponential backoff with jitter for transient errors
- **Discovery fallback** — HTML `<meta name="surf">` tag fallback

### @surfjs/devui

- Interactive introspection UI for Surf-enabled applications
- Server-side dev panel with command listing and testing
