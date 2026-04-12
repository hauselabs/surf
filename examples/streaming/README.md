# Surf.js Streaming Example

Server-Sent Events (SSE) streaming with Surf.js.

## Run

```bash
cd examples/streaming
npm install

# Terminal 1 — start the server
npm start

# Terminal 2 — run the streaming client
npm run client
```

## Commands

- `generate` — Streams tokens one by one (SSE)
- `summarize` — Streams progress updates during processing

## How It Works

1. Command is defined with `stream: true`
2. Handler uses `context.emit()` to send chunks
3. Client sends `{ stream: true }` in the execute request
4. Response is an SSE stream with `data:` lines containing `{ type: 'chunk' | 'done' | 'error', ... }`
