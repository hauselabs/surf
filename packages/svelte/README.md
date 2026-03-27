<div align="center">

# @surfjs/svelte

**Svelte utilities for the `window.surf` runtime — register local handlers, sync state, and surface Surf Live.**

[![npm](https://img.shields.io/npm/v/@surfjs/svelte?color=0057FF&label=npm)](https://www.npmjs.com/package/@surfjs/svelte)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/hauselabs/surf/blob/main/LICENSE)

</div>

---

A thin Svelte wrapper around [`@surfjs/web`](../web). Provides functions for registering local command handlers, syncing real-time state via stores, and setting up WebSocket connections via Surf Live.

Works with both Svelte 4 and Svelte 5.

## Install

```bash
npm install @surfjs/svelte
```

## `surfCommands` — Register local handlers

The primary function. Register one or more command handlers that run **locally in the browser** — no server roundtrip.

```svelte
<script>
  import { surfCommands } from '@surfjs/svelte'

  surfCommands({
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

<canvas id="main"></canvas>
```

Handlers are registered immediately and cleaned up when the component is destroyed.

**Modes:**

| Mode | Behavior |
|------|----------|
| `'local'` | Runs only in browser. No server call. |
| `'sync'` | Runs in browser, then POSTs to server in background. |

## SurfProvider — WebSocket / Surf Live

Set up a Surf WebSocket connection in your root layout:

```svelte
<script>
  import { createSurfProvider, setSurfContext } from '@surfjs/svelte'
  import { onDestroy } from 'svelte'

  const surf = createSurfProvider({
    url: 'wss://myapp.com/surf/ws',
    endpoint: 'https://myapp.com',
    channels: ['main']
  })

  setSurfContext(surf)

  onDestroy(() => surf.destroy())
</script>

<slot />
```

| Option | Type | Description |
|--------|------|-------------|
| `url` | `string` | WebSocket URL to connect to |
| `auth` | `string?` | Auth token to send on connect |
| `channels` | `string[]?` | Channels to subscribe to on connect |
| `endpoint` | `string?` | HTTP endpoint for manifest discovery |

## `surfState` — Real-time state sync

Receive server-pushed state updates as a Svelte store:

```svelte
<script>
  import { surfState } from '@surfjs/svelte'

  const order = surfState('order.updated', null)
</script>

{#if $order}
  <p>Status: {$order.status}</p>
{:else}
  <p>Waiting for order...</p>
{/if}
```

Returns a writable store that auto-updates from `surf:state` and `surf:patch` events.

## `surfExecute` — Execute commands

Convenience wrapper around `window.surf.execute()`:

```svelte
<script>
  import { surfExecute } from '@surfjs/svelte'

  async function fetchItems() {
    const result = await surfExecute('items.list', { limit: 10 })
    console.log(result)
  }
</script>
```

## Full example

```svelte
<!-- +layout.svelte -->
<script>
  import { createSurfProvider, setSurfContext } from '@surfjs/svelte'
  import { onDestroy } from 'svelte'

  const surf = createSurfProvider({
    url: 'wss://myapp.com/surf/ws',
    endpoint: 'https://myapp.com'
  })
  setSurfContext(surf)
  onDestroy(() => surf.destroy())
</script>

<slot />

<!-- Canvas.svelte -->
<script>
  import { surfCommands, surfState, surfExecute } from '@surfjs/svelte'

  surfCommands({
    'canvas.addCircle': {
      mode: 'local',
      run: (params) => {
        addCircleToCanvas(params)
        return { ok: true }
      }
    }
  })

  const latestEvent = surfState('canvas.updated', null)
</script>

<canvas id="main"></canvas>
```

## Relationship to `@surfjs/web`

`@surfjs/svelte` is a thin wrapper. Under the hood, `surfCommands` calls `registerCommand` from `@surfjs/web` and cleans up via `onDestroy`. If you're not using Svelte, use `@surfjs/web` directly.

## Part of Surf

[Website](https://surf.codes) · [Docs](https://surf.codes/docs) · [GitHub](https://github.com/hauselabs/surf)
