# Changelog

All notable changes to this project are documented in this file.

This is a monorepo changelog — entries cover all packages (`@surfjs/core`, `@surfjs/client`, `@surfjs/react`, `@surfjs/next`, `@surfjs/zod`, `@surfjs/web`, `@surfjs/vue`, `@surfjs/svelte`, `@surfjs/cli`, `@surfjs/devui`) unless a specific package is noted.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added
- **`SurfClientErrorCode` union type** — typed error codes for all `SurfClientError` exceptions. Includes `TIMEOUT`, `NETWORK_ERROR`, `NOT_CONNECTED`, `INVALID_MANIFEST`, `NOT_SUPPORTED` and more. Exported from `@surfjs/client`. (#cf74ff0)
- **`SURF_ERROR_CODES` + `isSurfErrorCode()`** — exported from `@surfjs/client` for programmatic error code checks. (#60ef626)
- **`SurfChannelControls` interface** — named return type for `useSurfChannel()` hook, exported from `@surfjs/react`. (#47dba67)
- **Test coverage: core validators** — 40 tests for Zod edge cases (nested objects, arrays, enums, optionals, `validateResult`). (#362658a)
- **Test coverage: middleware pipeline** — 17 tests for execution order, early returns, error propagation, double-next guard. (#362658a)
- **Test coverage: SurfError codes** — 56 tests covering all 9 `SurfErrorCode` values and every convenience constructor. (#362658a)
- **Test coverage: error handling paths** — 46 tests for malformed requests, handler errors, middleware semantics, HTTP transport error responses, auth paths, and serialization roundtrip. (#f936321)
- **Test coverage: `SurfClient` advanced** — 59 tests for initialization, auth flows, retry logic, streaming, cache, sessions, pipeline, `checkForUpdates`, and typed proxy. (#fc5d9a0)
- **Test coverage: CLI** — 57 tests for flag parsing, type coercion, header building, JSON highlighting, and all three commands (`ping`/`inspect`/`test`). (#e3bde37)
- **CLI utility exports** — `parseArgs`, `buildHeaders`, `coerceValue`, `syntaxHighlightJson`, `ping`, `inspect`, `test` are now exported from `@surfjs/cli` for testability. (#e3bde37)

### Changed
- **TypeScript strict sweep — `@surfjs/core`** — proper `ws` peer-dep types via `import type { WebSocketServer }`; removed `any` in `surf.ts`. (#9b40532)
- **TypeScript strict sweep — `@surfjs/client`** — eliminated two `as unknown as` double-casts; added `getFetch()` to `HttpTransport`; added `isSessionResult()` type guard; rewrote `window.ts` catch block with proper narrowing. (#60ef626)
- **TypeScript strict sweep — adapters** — `noUncheckedIndexedAccess` added to web/svelte/vue tsconfigs; replaced unsafe casts in web/runtime.ts, vue/provider.ts, and next/shared.ts with proper type guards/helpers. (#2c84cdb)
- **TypeScript strict sweep — CLI + React** — `noUncheckedIndexedAccess` + `forceConsistentCasingInFileNames` added; fixed all indexed-access type errors in CLI; `SurfChannelControls` named interface added for `useSurfChannel()`. (#47dba67)
- **All raw `Error()` throws replaced** — every error that reaches the caller in `@surfjs/client` is now a `SurfClientError` with a typed code. (#cf74ff0)
- **SPEC.md §5 updated** — added server vs client error code tables with handling examples. (#cf74ff0)
- **`@surfjs/next` README overhauled** — middleware export docs, custom basePath, edge caveat, Pages Router, composing middleware, full API table. (#481043f)
- **CONTRIBUTING.md updated** — all 10 packages documented, adapter guide, testing section, release process. (#481043f)

### Fixed
- **CLI `main()` guard** — wrapped with `import.meta.url` check for ESM testability. (#e3bde37)

---

## 0.5.0 (2026-03-27)

### Added
- **`@surfjs/vue`** — new Vue 3 adapter with `SurfProvider`, `useSurf`, `useSurfChannel`, and `useSurfState` composables. (#3cee04a)
- **`@surfjs/svelte`** — new Svelte adapter with stores, actions, and context-based session management. (#3cee04a)

### Changed
- **Unified versioning** — all packages harmonized to `0.5.0`. Previously `@surfjs/react` was on `0.4.x` and others on `0.3.x`. All packages are now versioned together from `0.5.0` onwards. (#be44b1a)
- **SurfBadge redesigned** — replaced rainbow/holographic aesthetic with consistent Surf blue color scheme; improved hover/click interaction consistency; cleaner codebase. (#bd8092f)

---

## 0.3.12 (2026-03-27)

> Note: patches `0.3.10` and `0.3.11` were intermediate version bumps; their changes are included here.

### Added
- **`@surfjs/web`** — new package for local/browser execution via `window.surf` dispatcher. Enables agents running in the browser to call commands without a network round-trip. (#baf67b8)
- **`window.surf` global** — `@surfjs/react` now registers `window.__surf__` and `window.surf` on mount, exposing commands to browser-based agents. (#d9581f9)

### Fixed
- **`@surfjs/cli`** — `baseUrl` is now read from the manifest `execute` field instead of hard-coded path construction. (#2cbb087)
- **Dependency specifiers** — replaced remaining `workspace:*` references with explicit semver ranges to avoid `npm install` failures. (#6abf248)

### Docs
- Updated all READMEs to document `@surfjs/web` local execution architecture. (#77fe45b)

---

## @surfjs/react 0.4.0 / 0.3.9 (2026-03-26)

### Added
- **`SurfBadge` component** — holographic seal badge that signals a site is Surf-enabled. Serves as a visual trust signal for humans and machine-readable context for AI vision models. Includes hover panel with command descriptions, ambient hue drift, and theme-aware styling. (#62)
- **`surfMiddleware` for `@surfjs/next`** — adds `/.well-known/surf.json` discovery endpoint via Next.js middleware, enabling standard manifest discovery without custom route setup. (#aa57d08)
- **Psychedelic click mode** on `SurfBadge` — visual effect on click interaction. (#33e6002)

### Changed
- `@surfjs/react` bumped to `0.4.0` (significant new component); all other packages remain on `0.3.9`.

---

## 0.3.8 (2026-03-25)

### Fixed
- **`@surfjs/zod`** — Zod 4 type detection: `_def.typeName` doesn't exist in Zod 4; now checks `_def.type` as fallback and normalizes type names. Also fixes enum value extraction (`entries` vs `values`), array element resolution, and default value handling. (#45)
- **`@surfjs/zod`** — `defineZodCommand()` TypeScript strict mode incompatibility: changed constraint from `S extends Record<string, unknown>` to `S extends object`. (#54)
- **`@surfjs/core`** — circular references in command responses no longer crash the server. JSON serialization is wrapped in try/catch, returning a proper `INTERNAL_ERROR` response. (#53)
- **`@surfjs/core`** — `authVerifier` exceptions no longer propagate to Express as unhandled errors; wrapped in try/catch, returns structured `AUTH_FAILED` JSON. (#52)
- **`@surfjs/core`** — `wsHandler()` now works in ESM modules; replaced `require('ws')` with `await import('ws')` for CJS/ESM dual compatibility. (#51)
- **`@surfjs/client`** — auth token is now passed during manifest discovery requests. (#6b045b8)
- **`@surfjs/core`** — channels config is serialized into the manifest. (#aa95bff)

---

## 0.3.7 (2026-03-24)

### Fixed
- **`@surfjs/zod`** — duck-typing in `zodValidator` for Zod 3+4 compatibility (no `instanceof` checks). (#68)
- **`@surfjs/client`** — permanent errors (e.g. `NOT_FOUND`, `UNAUTHORIZED`) are no longer retried. (#3bcfe5b)
- **`@surfjs/core`** — session state no longer leaks across sessions. (#3bcfe5b)
- **`@surfjs/core`** — expired sessions return a proper `SESSION_EXPIRED` error instead of hanging. (#3bcfe5b)
- **`@surfjs/client`** — manifest auth token included in discovery fallback. (#3bcfe5b)

---

## 0.3.6 (2026-03-23)

### Fixed
- **`@surfjs/client`** — retry logic: exponential backoff no longer applies to non-retryable errors. (#22)
- **`@surfjs/client`** — LRU cache eviction: entries beyond max-size are correctly removed. (#23)
- **`@surfjs/core`** — Hono sync adapter: non-async handlers no longer hang. (#24)
- **`@surfjs/core`** — XSS sanitization applied to command response strings. (#28)
- **`@surfjs/core`** — ESM compatibility: dynamic import used for optional peer dependencies. (#29, #30)
- **`@surfjs/core`** — session expiry handling: expired sessions are cleaned up and return a structured error. (#19, #20)
- **`@surfjs/core`** — memory cleanup: session GC runs periodically to prevent unbounded growth. (#21)
- **`@surfjs/core`** — WebSocket rate limiting: per-connection limits are now enforced correctly. (#25)
- **`@surfjs/client`** — cache key generation: keys now include all relevant request parameters. (#27)

---

## 0.3.5 (2026-03-23)

### Fixed
- **`@surfjs/core`** — auth boolean bypass: `auth: false` on a command no longer bypasses global auth requirements. (#16)
- **`@surfjs/core`** — Fastify empty body: `undefined` request body no longer causes a parse error. (#17)
- **`@surfjs/core`** — CORS preflight: `OPTIONS` requests are handled before auth checks. (#18)

---

## 0.3.4 (2026-03-22)

### Fixed
- **`@surfjs/react`** — initial state delivered on `useSurfState` subscribe (previously only on first mutation). (#fd9d3e0)
- **Docs** — `@surfjs/react` added to root README package table.

---

## 0.3.3 (2026-03-22)

### Fixed
- **`@surfjs/core`** — hidden commands (`auth: 'hidden'`) now correctly excluded from Fastify and Hono manifest responses. (#585f403)
- **`@surfjs/core`** — Hono adapter ESM import resolved. (#585f403)
- **`@surfjs/client`** — `SurfClient.commands` getter returns correct command list after manifest load. (#585f403)

---

## 0.3.2 (2026-03-22)

### Fixed
- **`@surfjs/react`** — custom channel events dispatched correctly after reconnect. (#8b14185)
- **`@surfjs/core`** — `channelAuth` errors return structured JSON instead of throwing. (#8b14185)
- **`@surfjs/react`** — channel subscriptions are recovered after WebSocket reconnection. (#8b14185)

---

## 0.3.1 (2026-03-22)

### Security
- **Surf Live hardened** — fail-closed channel auth (unauthenticated connections cannot subscribe to restricted channels). (#143d9a7)
- **Origin checking** — WebSocket connections from disallowed origins are rejected. (#143d9a7)
- **Message size limit** — oversized WebSocket messages are rejected before processing. (#143d9a7)
- **Per-channel versions** — each channel tracks its own version to prevent stale-state attacks. (#143d9a7)

---

## 0.3.0 (2026-03-22)

### Added
- **Surf Live** — real-time state synchronization via named channels. Use `createChannel()` on the server and `useSurfChannel()` / `useSurfState()` on the client. Supports auth-gated channels, batched updates, and presence. (#95f7a44)

---

## 0.2.3 (2026-03-21)

### Security
- **Session hijacking** — session tokens are now cryptographically random and not guessable. (#0016911)
- **Hidden command exposure** — hidden commands are fully stripped from unauthenticated manifest responses. (#0016911)
- **Error leakage** — internal error details (stack traces, paths) are suppressed in production responses. (#0016911)
- **Timing attacks** — auth token comparison uses constant-time equality. (#0016911)
- **Rate limiter cleanup** — rate limiter state is purged for expired/ended sessions. (#0016911)

---

## 0.2.2 (2026-03-21)

### Fixed
- **`workspace:*` dependencies** — all inter-package `workspace:*` specifiers replaced with semver ranges for correct `npm install` behaviour. (#acda8a5)
- **Zod peer dependency** — pinned to `^3` to avoid accidental Zod 4 installs until full compatibility is confirmed. (#acda8a5)
- **README** — added `await` to `createSurf()` quick-start example (breaking change from 0.2.0). (#acda8a5)

---

## 0.2.1 (2026-03-21)

### Added
- **Configurable `basePath`** — `SurfClient` and CLI accept a `basePath` option to support Surf endpoints mounted at non-root paths (e.g. `/api/surf`). (#716fce5)

### Fixed
- **CI** — test runner async context issue resolved; all tests now pass in CI. (#716fce5)
- **`pnpm-lock.yaml`** — regenerated to match updated dependencies. (#716fce5)

---

## 0.2.0 (2026-03-21)

### Features — Phases 1–8

- **Phase 1: Streaming** — SSE streaming support for commands via `stream: true` and `ctx.emit()`
- **Phase 2: Sessions** — stateful sessions with `InMemorySessionStore`, `SessionStore` interface, and session middleware
- **Phase 3: Rate Limiting** — global and per-command rate limiting with `RateLimiter` and configurable `keyBy` strategies
- **Phase 4: Validation** — `validateParams()` and `validateResult()` with strict mode, enum support, and nested object/array validation
- **Phase 5: Pagination** — cursor and offset pagination with `paginatedResult()` helper and auto-injected manifest params
- **Phase 6: Pipeline** — multi-command pipeline execution with `$prev`/`$alias` references and `continueOnError`
- **Phase 7: Framework Adapters** — first-class adapters for Fastify (`fastifyPlugin`) and Hono (`honoApp`, `honoMiddleware`); `createSurf` is now async
- **Phase 8: Scoped Auth** — `requiredScopes` on commands, `scopedVerifier()` helper, scopes in `AuthResult` and `ExecutionContext`

### Breaking Changes
- **`createSurf()` is now async** (returns `Promise<SurfInstance>`) — Phase 7. All instantiation calls must be `await`ed.

---

## 0.1.6 (2026-03-21)

### Added
- **Hidden commands** — `auth: 'hidden'` excludes commands from the public manifest. Only revealed when a valid Bearer token is provided. Agents without credentials cannot discover hidden commands.

### Fixed
- **CLI** — error objects now render properly instead of `[object Object]`.
- **CLI** — auth-required commands fail fast before prompting for parameters.
- **Publish** — fixed `workspace:*` dependency specifiers that broke `npm install`.

---

## 0.1.5 (2026-03-21)

### Fixed
- **Dependencies** — replaced all `workspace:*` dependency specifiers with explicit semver ranges to fix `npm install` from the registry.

---

## 0.1.4 / 0.1.3 (2026-03-21)

### Added
- **`examples`** — runnable example objects on each command (`examples: [...]`) in the manifest.
- **`about`** — free-text description field on `createSurf()` config, included in manifest.
- **Namespace descriptions** — `group()` accepts a `description` for top-level command namespaces.
- **`NOT_FOUND` error code** — returned when a requested command does not exist (previously fell through to `INTERNAL_ERROR`).
- **Rate limits in manifest** — per-command rate limit config is reflected in the manifest for agent awareness.
- **SPEC.md** — protocol specification document added to the repository.
- **CONTRIBUTING.md** — development setup and contribution guide.

### Changed
- **Validation errors** — improved error message format; errors now include the failing param name and expected type.

---

## 0.1.2 (2026-03-21)

### Added
- npm README badges and package introductions.
- Improved CLI install guide.

---

## 0.1.0 (2026-03-21)

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
