# Changelog

## 0.2.0 (2026-03-21)

### Features — Overnight Queue (Phases 1–8)

- **Phase 1: Streaming** — SSE streaming support for commands via `stream: true` and `ctx.emit()`
- **Phase 2: Sessions** — Stateful sessions with `InMemorySessionStore`, `SessionStore` interface, and session middleware
- **Phase 3: Rate Limiting** — Global and per-command rate limiting with `RateLimiter` and configurable `keyBy` strategies
- **Phase 4: Validation** — `validateParams()` and `validateResult()` with strict mode, enum support, and nested object/array validation
- **Phase 5: Pagination** — Cursor and offset pagination with `paginatedResult()` helper and auto-injected manifest params
- **Phase 6: Pipeline** — Multi-command pipeline execution with `$prev`/`$alias` references and `continueOnError`
- **Phase 7: Framework Adapters** — First-class adapters for Fastify (`fastifyPlugin`) and Hono (`honoApp`, `honoMiddleware`); `createSurf` is now async
- **Phase 8: Scoped Auth** — `requiredScopes` on commands, `scopedVerifier()` helper, scopes in `AuthResult` and `ExecutionContext`

### Breaking Changes

- `createSurf()` is now **async** (returns `Promise<SurfInstance>`) — Phase 7

## 0.1.6 (2025-03-21)

### Bug Fixes
- **CLI:** Error objects now render properly instead of `[object Object]`
- **CLI:** Auth-required commands fail fast before prompting for parameters
- **Publish:** Fixed `workspace:*` dependency specifiers that broke `npm install`

### Features
- **Hidden commands** — `auth: 'hidden'` excludes commands from the public manifest. Only revealed when a valid Bearer token is provided. Agents without credentials cannot discover hidden commands.
- **Auth levels table:** `none` | `required` | `optional` | `hidden`

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
