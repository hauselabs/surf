# Surf.js Streaming Example

Server-Sent Events (SSE) streaming with Surf.js.

## Run

```bash
# Terminal 1 — start the server
node server.js

# Terminal 2 — run the streaming client
node client.js
```

## Commands

- `generate` — Streams tokens one by one (SSE)
- `summarize` — Streams progress updates during processing

## How It Works

1. Command is defined with `stream: true`
2. Handler uses `context.emit()` to send chunks
3. Client sends `{ stream: true }` in the execute request
4. Response is an SSE stream with `data:` lines containing `{ type: 'chunk' | 'done' | 'error', ... }`
