<div align="center">

# @surfjs/react

**React hooks for the `window.surf` runtime — register local handlers, sync state, and surface Surf Live.**

[![npm](https://img.shields.io/npm/v/@surfjs/react?color=0057FF&label=npm)](https://www.npmjs.com/package/@surfjs/react)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/hauselabs/surf/blob/main/LICENSE)

</div>

---

A thin React wrapper around [`@surfjs/web`](../web). Provides hooks for registering local command handlers, syncing real-time state, and setting up WebSocket connections via Surf Live.

## Install

```bash
npm install @surfjs/react
```

## `useSurfCommands` — Register local handlers

The primary hook. Register one or more command handlers that run **locally in the browser** — no server roundtrip.

```tsx
import { useSurfCommands } from '@surfjs/react'

function Canvas() {
  useSurfCommands({
    'canvas.addCircle': {
      mode: 'local',
      run: ({ x, y, radius }) => {
        addCircleToCanvas({ x, y, radius })
        return { ok: true }
      }
    },
    'canvas.clear': {
      mode: 'local',
      run: () => {
        clearCanvas()
        return { ok: true }
      }
    }
  })

  return <canvas id="main" />
}

// Agent runs: await window.surf.execute('canvas.addCircle', { x: 200, y: 150, radius: 50 })
```

Handlers are automatically registered on mount and cleaned up on unmount.

**Modes:**

| Mode | Behavior |
|------|----------|
| `'local'` | Runs only in browser. No server call. |
| `'sync'` | Runs in browser, then POSTs to server in background. |

## `SurfProvider` — WebSocket / Surf Live

Wrap your app with `SurfProvider` to establish a WebSocket connection for real-time state sync:

```tsx
import { SurfProvider } from '@surfjs/react'

function App() {
  return (
    <SurfProvider endpoint="https://myapp.com" sessionId="user-abc">
      <MyApp />
    </SurfProvider>
  )
}
```

| Prop | Type | Description |
|------|------|-------------|
| `endpoint` | `string` | Your Surf server base URL |
| `sessionId` | `string?` | Session identifier for scoped events |
| `autoConnect` | `boolean?` | Connect on mount (default: `true`) |

## `useSurfState` — Real-time state sync

Receive server-pushed state updates over the WebSocket connection:

```tsx
import { useSurfState } from '@surfjs/react'

function OrderStatus() {
  const order = useSurfState<Order>('order.updated')

  if (!order) return <p>Waiting for order...</p>
  return <p>Status: {order.status}</p>
}
```

State updates are scoped to the active session — no cross-user leakage.

## `SurfBadge` — Floating agent indicator

Drop in a floating badge that shows when an AI agent is connected and executing commands:

```tsx
import { SurfBadge } from '@surfjs/react'

function App() {
  return (
    <>
      <MyApp />
      <SurfBadge />
    </>
  )
}
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `position` | `'bottom-right' \| 'bottom-left' \| 'top-right' \| 'top-left'` | `'bottom-right'` | Badge placement |
| `label` | `string` | `'Agent connected'` | Text shown when active |

## Full example

```tsx
import { SurfProvider, useSurfCommands, useSurfState, SurfBadge } from '@surfjs/react'

function Canvas() {
  useSurfCommands({
    'canvas.addCircle': {
      mode: 'local',
      run: (params) => {
        addCircleToCanvas(params)
        return { ok: true }
      }
    }
  })

  const latestEvent = useSurfState('canvas.updated')

  return <canvas id="main" />
}

function App() {
  return (
    <SurfProvider endpoint="https://myapp.com">
      <Canvas />
      <SurfBadge />
    </SurfProvider>
  )
}
```

## Relationship to `@surfjs/web`

`@surfjs/react` is a thin wrapper. Under the hood, `useSurfCommands` calls `registerCommand` from `@surfjs/web` and returns the cleanup function. If you're not using React, use `@surfjs/web` directly.

## Part of Surf

[Website](https://surf.codes) · [Docs](https://surf.codes/docs) · [GitHub](https://github.com/hauselabs/surf)
