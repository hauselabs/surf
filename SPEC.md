# Surf Protocol Specification

**Version:** 0.1.0
**Status:** Draft

---

## Overview

Surf is an open protocol that enables AI agents to discover and interact with websites through structured, typed commands — without relying on vision models, DOM parsing, or browser automation.

A Surf-enabled website exposes a machine-readable **manifest** describing available commands. Agents discover this manifest, then execute commands via standard HTTP, WebSocket, or in-browser transports.

---

## 1. Discovery

### 1.1 Well-Known Endpoint (Primary)

Websites MUST serve a JSON manifest at:

```
GET /.well-known/surf.json
```

**Response:** `200 OK` with `Content-Type: application/json`

The manifest SHOULD include `ETag` and `Cache-Control` headers for efficient caching.

### 1.2 HTML Meta Tag (Fallback)

Websites MAY include a meta tag pointing to the manifest:

```html
<meta name="surf" content="/.well-known/surf.json" />
```

### 1.3 robots.txt

Websites SHOULD allow access to the manifest:

```
Allow: /.well-known/surf.json
```

---

## 2. Manifest Schema

```json
{
  "surf": "0.1.0",
  "name": "Service Name",
  "description": "Optional description",
  "version": "1.0.0",
  "auth": {
    "type": "bearer | apiKey | oauth2 | none"
  },
  "commands": {
    "commandName": {
      "description": "What this command does",
      "params": {
        "paramName": {
          "type": "string | number | boolean | object | array",
          "required": true,
          "default": null,
          "description": "Parameter description",
          "enum": ["allowed", "values"],
          "properties": {},
          "items": {}
        }
      },
      "returns": {
        "type": "object",
        "properties": {}
      },
      "auth": "none | required | optional | hidden",
      "tags": ["category"],
      "hints": {
        "idempotent": true,
        "sideEffects": false,
        "estimatedMs": 200
      },
      "stream": false,
      "rateLimit": {
        "windowMs": 60000,
        "maxRequests": 100,
        "keyBy": "ip | session | auth | global"
      }
    }
  },
  "events": {
    "eventName": {
      "description": "Event description",
      "scope": "session | global | broadcast",
      "data": {}
    }
  },
  "types": {
    "TypeName": {
      "type": "object",
      "description": "Reusable type",
      "properties": {}
    }
  },
  "checksum": "sha256-hash",
  "updatedAt": "ISO-8601"
}
```

### 2.1 Required Fields

- `surf` — Protocol version (semver)
- `name` — Human-readable service name
- `commands` — At least one command definition

### 2.2 Command Names

- Flat: `search`, `addToCart`
- Namespaced (dot notation): `cart.add`, `cart.remove`, `user.profile`

### 2.3 Parameter Types

| Type | JSON Type | Description |
|------|-----------|-------------|
| `string` | `string` | Text values, optionally constrained by `enum` |
| `number` | `number` | Numeric values (integer or float) |
| `boolean` | `boolean` | True/false |
| `object` | `object` | Nested structure with `properties` |
| `array` | `array` | List with `items` schema |

### 2.4 Type References

Parameters and return schemas MAY use `$ref` to reference types:

```json
{ "$ref": "#/types/Product" }
```

### 2.5 Hints

Hints are advisory metadata for agent optimization:

| Hint | Type | Meaning |
|------|------|---------|
| `idempotent` | `boolean` | Safe to retry with same params |
| `sideEffects` | `boolean` | Whether command modifies state |
| `estimatedMs` | `number` | Expected execution time in ms |

---

## 3. Transports

### 3.1 HTTP (Default)

#### Execute Command

```
POST /surf/execute
Content-Type: application/json

{
  "command": "search",
  "params": { "query": "shoes" },
  "sessionId": "optional-session-id"
}
```

**Response:**

```json
{
  "ok": true,
  "result": { ... },
  "timing": { "ms": 47 }
}
```

**Error Response:**

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_PARAMS",
    "message": "Missing required parameter: query"
  }
}
```

#### Pipeline

```
POST /surf/pipeline
Content-Type: application/json

{
  "steps": [
    { "command": "search", "params": { "query": "shoes" }, "as": "results" },
    { "command": "addToCart", "params": { "sku": "$results[0].sku" } }
  ],
  "sessionId": "optional",
  "continueOnError": false
}
```

**Response:**

```json
{
  "ok": true,
  "results": [
    { "command": "search", "ok": true, "result": [...] },
    { "command": "addToCart", "ok": true, "result": { ... } }
  ],
  "timing": { "ms": 89 }
}
```

#### Sessions

```
POST /surf/session/start    → { "sessionId": "abc123" }
POST /surf/session/end      → { "ok": true }
```

### 3.2 WebSocket

Connect to `ws://host/surf/ws`

**Execute:**
```json
{ "type": "execute", "id": "req-1", "command": "search", "params": { "query": "shoes" } }
```

**Response:**
```json
{ "type": "result", "id": "req-1", "ok": true, "result": { ... } }
```

**Events:**
```json
{ "type": "event", "event": "order.updated", "data": { ... } }
```

### 3.3 SSE Streaming

When `stream: true` is set on a command and the request includes `"stream": true`:

```
POST /surf/execute
Content-Type: application/json

{ "command": "generate", "params": { "prompt": "Hello" }, "stream": true }
```

**Response:** `Content-Type: text/event-stream`

```
data: {"type":"chunk","data":{"token":"Hello"}}

data: {"type":"chunk","data":{"token":" world"}}

data: {"type":"done","result":{"completed":true}}
```

### 3.4 Window Runtime

For browser-based agents, the server can inject `window.__surf__` providing:

- `window.__surf__.manifest` — The full manifest
- `window.__surf__.execute(command, params)` — Execute a command
- `window.__surf__.on(event, callback)` — Subscribe to events

---

## 4. Authentication

### 4.1 Bearer Token

```
Authorization: Bearer <token>
```

### 4.2 API Key

```
X-API-Key: <key>
```

### 4.3 Per-Command Auth

Commands specify auth requirements:

- `"none"` — No authentication needed
- `"required"` — Request MUST include valid auth
- `"optional"` — Auth accepted but not required (may enable personalization)
- `"hidden"` — Command is excluded from the manifest unless the request includes a valid auth token. When revealed, it appears as `"required"`. Agents without credentials cannot discover hidden commands.

### 4.4 Hidden Command Discovery

When `GET /.well-known/surf.json` is requested:

- **Without auth:** Hidden commands are omitted entirely from the `commands` object
- **With valid auth:** Hidden commands are included with `auth: "required"`

The manifest `checksum` changes depending on which commands are included, ensuring agents can detect when their view of the API has changed after authenticating.

---

## 5. Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNKNOWN_COMMAND` | 404 | Command not found in manifest |
| `NOT_FOUND` | 404 | Resource not found (general) |
| `INVALID_PARAMS` | 400 | Parameter validation failed |
| `AUTH_REQUIRED` | 401 | Auth required but not provided |
| `AUTH_FAILED` | 403 | Auth token invalid or insufficient scope |
| `SESSION_EXPIRED` | 410 | Session no longer valid |
| `RATE_LIMITED` | 429 | Rate limit exceeded |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `NOT_SUPPORTED` | 501 | Feature not available |

---

## 6. Design Principles

1. **Discoverable** — Agents find capabilities without prior knowledge
2. **Typed** — All parameters and returns have explicit types
3. **Fast** — Direct execution, no rendering pipeline
4. **Secure** — Auth, rate limiting, and session isolation by default
5. **Transport-agnostic** — HTTP, WebSocket, and in-browser all work
6. **Language-agnostic** — Protocol is JSON-over-HTTP; implement in any language

---

## 7. MIME Types

- Manifest: `application/json`
- Execute request/response: `application/json`
- Streaming: `text/event-stream`

---

## 8. Pagination

Commands that return collections SHOULD support pagination. Surf defines a standard pagination convention that agents can detect and iterate automatically.

### 8.1 Declaring Pagination

A command is paginated when its manifest entry includes `"paginated": true`:

```json
{
  "commands": {
    "articles.list": {
      "description": "List published articles",
      "paginated": true,
      "params": { ... },
      "returns": { ... }
    }
  }
}
```

When a command is declared paginated, the runtime automatically injects standard pagination parameters into its manifest params (see §8.2).

### 8.2 Pagination Parameters

Surf supports two pagination styles:

#### Cursor-based (preferred)

| Parameter | Type | Description |
|-----------|------|-------------|
| `cursor` | `string` | Opaque cursor from a previous response's `nextCursor` |
| `limit` | `number` | Maximum number of items to return |

Cursor-based pagination is the default and preferred style. Cursors are opaque strings — agents MUST NOT interpret or construct them.

#### Offset-based

| Parameter | Type | Description |
|-----------|------|-------------|
| `offset` | `number` | Zero-based index to start from |
| `limit` | `number` | Maximum number of items to return |

Offset-based pagination is supported for APIs where cursors are impractical.

### 8.3 Response Envelope

Paginated commands MUST return a standard envelope:

```json
{
  "items": [ ... ],
  "nextCursor": "opaque-string",
  "hasMore": true,
  "total": 42
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `items` | `array` | Yes | The page of results |
| `nextCursor` | `string \| null` | No | Cursor for the next page (`null` or absent = last page) |
| `hasMore` | `boolean` | Yes | Whether more results exist beyond this page |
| `total` | `number` | No | Total number of items across all pages (if known) |

### 8.4 Pagination Config

Command authors MAY provide pagination configuration:

```json
{
  "paginated": {
    "defaultLimit": 20,
    "maxLimit": 100,
    "style": "cursor"
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `defaultLimit` | `number` | `20` | Default page size when `limit` is omitted |
| `maxLimit` | `number` | `100` | Maximum allowed `limit` value |
| `style` | `"cursor" \| "offset"` | `"cursor"` | Which pagination style this command uses |

When `paginated` is `true` (boolean), defaults are used.

### 8.5 Agent Behavior

Agents iterating over paginated commands SHOULD:

1. Call the command without `cursor`/`offset` to get the first page
2. Check `hasMore` in the response
3. If `hasMore` is `true`, call again with the returned `nextCursor` (or incremented `offset`)
4. Repeat until `hasMore` is `false` or `nextCursor` is `null`/absent

Agents SHOULD respect `maxLimit` and MUST NOT assume a specific page size.

---

## 9. Surf Live — Real-Time State Sync

Surf Live enables real-time state broadcasting from the server to all connected browser clients via WebSocket channels. This is designed for use cases where an AI agent executes commands on the server and the resulting state changes should be reflected in all connected UIs instantly.

### 9.1 Channels

A **channel** is a string identifier (e.g. `project-123`, `document-abc`) that groups WebSocket connections. Clients subscribe to channels, and the server emits events scoped to specific channels. Only connections subscribed to a channel receive its events.

Channels are opt-in — Surf Live must be explicitly enabled in the server config:

```typescript
const surf = createSurf({
  name: 'My App',
  commands: { /* ... */ },
  live: {
    enabled: true,
    maxChannelsPerConnection: 10,
    channelAuth: async (token, channelId) => {
      return verifyAccess(token, channelId);
    },
  },
});
```

### 9.2 WebSocket Subscribe/Unsubscribe

Clients subscribe to channels by sending:

```json
{ "type": "subscribe", "channels": ["project-123", "document-abc"] }
```

Clients unsubscribe by sending:

```json
{ "type": "unsubscribe", "channels": ["project-123"] }
```

If `channelAuth` is configured, the client MUST have sent an `auth` message before subscribing. The auth callback is invoked for each channel. Subscriptions that fail auth are silently dropped.

A connection may subscribe to at most `maxChannelsPerConnection` channels (default: 10). Exceeding this limit returns an error.

### 9.3 State Events

Surf Live defines two reserved event types for state synchronization:

#### `surf:state` — Full State Update

```json
{
  "type": "event",
  "event": "surf:state",
  "data": {
    "channel": "project-123",
    "state": { "timeline": { "clips": [], "playhead": 42.5 } },
    "version": 7
  }
}
```

#### `surf:patch` — Partial State Patch

```json
{
  "type": "event",
  "event": "surf:patch",
  "data": {
    "channel": "project-123",
    "patch": { "playhead": 43.0 },
    "version": 8
  }
}
```

The `version` field is a monotonically increasing integer used for ordering and deduplication. Clients SHOULD ignore events with a version ≤ the last applied version.

### 9.4 Server-Side API

The `SurfInstance` exposes a `live` property with convenience methods:

```typescript
// Full state push
surf.live.setState('project-123', { timeline: { clips: [...], playhead: 42.5 } });

// Incremental patch
surf.live.patchState('project-123', { playhead: 43.0 });

// Custom channel event
surf.live.emit('cursor.moved', { x: 100, y: 200 }, 'project-123');
```

### 9.5 Security Model

- **Off by default** — `live.enabled` must be set to `true`
- **Channel auth** — optional async callback to verify subscription access
- **Max channels per connection** — prevents resource abuse (default: 10)
- **Isolation** — channel events are never leaked to session-scoped or global listeners
- **Auth gating** — if `channelAuth` is configured, unauthenticated connections cannot subscribe

### 9.6 Example Flow

```
1. Client connects via WebSocket
2. Client sends: { type: "auth", token: "bearer-xyz" }
3. Client sends: { type: "subscribe", channels: ["project-123"] }
4. Server verifies auth → subscribes connection to channel
5. Agent executes: surf.live.setState("project-123", { ... })
6. Server broadcasts: { type: "event", event: "surf:state", data: { ... } }
7. All clients subscribed to "project-123" receive the update
8. React clients with useSurfState("project-123", initial) auto-update
```

---

*This specification is a living document. Feedback and contributions welcome at [github.com/hauselabs/surf](https://github.com/hauselabs/surf).*
