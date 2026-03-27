<div align="center">

# @surfjs/vue

**Vue composables for the `window.surf` runtime — register local handlers, sync state, and surface Surf Live.**

[![npm](https://img.shields.io/npm/v/@surfjs/vue?color=0057FF&label=npm)](https://www.npmjs.com/package/@surfjs/vue)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/hauselabs/surf/blob/main/LICENSE)

</div>

---

A thin Vue 3 wrapper around [`@surfjs/web`](../web). Provides composables for registering local command handlers, syncing real-time state, and setting up WebSocket connections via Surf Live.

## Install

```bash
npm install @surfjs/vue
```

## `useSurfCommands` — Register local handlers

The primary composable. Register one or more command handlers that run **locally in the browser** — no server roundtrip.

```vue
<script setup>
import { useSurfCommands } from '@surfjs/vue'

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
</script>

<template>
  <canvas id="main" />
</template>
```

Handlers are automatically registered on mount and cleaned up on unmount.

**Modes:**

| Mode | Behavior |
|------|----------|
| `'local'` | Runs only in browser. No server call. |
| `'sync'` | Runs in browser, then POSTs to server in background. |

## `SurfProvider` — WebSocket / Surf Live

Wrap your app with `SurfProvider` to establish a WebSocket connection for real-time state sync:

```vue
<script setup>
import { SurfProvider } from '@surfjs/vue'
</script>

<template>
  <SurfProvider url="wss://myapp.com/surf/ws" endpoint="https://myapp.com">
    <MyApp />
  </SurfProvider>
</template>
```

| Prop | Type | Description |
|------|------|-------------|
| `url` | `string` | WebSocket URL to connect to |
| `auth` | `string?` | Auth token to send on connect |
| `channels` | `string[]?` | Channels to subscribe to on connect |
| `endpoint` | `string?` | HTTP endpoint for manifest discovery |

## `useSurfState` — Real-time state sync

Receive server-pushed state updates over the WebSocket connection:

```vue
<script setup>
import { useSurfState } from '@surfjs/vue'

const order = useSurfState<Order>('order.updated', null)
</script>

<template>
  <p v-if="order">Status: {{ order.status }}</p>
  <p v-else>Waiting for order...</p>
</template>
```

Returns a Vue `ref` that auto-updates from `surf:state` and `surf:patch` events.

## `useSurf` — Access context

Access the Surf context anywhere within a `SurfProvider`:

```vue
<script setup>
import { useSurf } from '@surfjs/vue'

const { execute, status, connected } = useSurf()

async function runCommand() {
  const result = await execute('items.list', { limit: 10 })
  console.log(result)
}
</script>
```

## `useSurfEvent` — Subscribe to events

```vue
<script setup>
import { useSurfEvent } from '@surfjs/vue'

useSurfEvent('notification.received', (data) => {
  console.log('Got notification:', data)
})
</script>
```

Automatically cleans up on component unmount.

## `SurfBadge` — Floating agent indicator

```vue
<script setup>
import { SurfBadge } from '@surfjs/vue'
</script>

<template>
  <MyApp />
  <SurfBadge endpoint="https://myapp.com" :commands="commands" />
</template>
```

## Full example

```vue
<script setup>
import { SurfProvider, useSurfCommands, useSurfState, SurfBadge } from '@surfjs/vue'

useSurfCommands({
  'canvas.addCircle': {
    mode: 'local',
    run: (params) => {
      addCircleToCanvas(params)
      return { ok: true }
    }
  }
})

const latestEvent = useSurfState('canvas.updated', null)
</script>

<template>
  <SurfProvider url="wss://myapp.com/surf/ws">
    <canvas id="main" />
    <SurfBadge endpoint="https://myapp.com" />
  </SurfProvider>
</template>
```

## Relationship to `@surfjs/web`

`@surfjs/vue` is a thin wrapper. Under the hood, `useSurfCommands` calls `registerCommand` from `@surfjs/web` and returns the cleanup function via `onUnmounted`. If you're not using Vue, use `@surfjs/web` directly.

## Part of Surf

[Website](https://surf.codes) · [Docs](https://surf.codes/docs) · [GitHub](https://github.com/hauselabs/surf)
