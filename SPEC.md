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
      "auth": "none | required | optional",
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

---

## 5. Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNKNOWN_COMMAND` | 404 | Command not found |
| `INVALID_PARAMS` | 400 | Parameter validation failed |
| `AUTH_REQUIRED` | 401 | Auth required but not provided |
| `AUTH_FAILED` | 403 | Auth token invalid or insufficient |
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

*This specification is a living document. Feedback and contributions welcome at [github.com/hauselabs/surf](https://github.com/hauselabs/surf).*
