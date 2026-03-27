<div align="center">

# @surfjs/web

**The `window.surf` runtime — local command execution for AI agents in the browser.**

[![npm](https://img.shields.io/npm/v/@surfjs/web?color=0057FF&label=npm)](https://www.npmjs.com/package/@surfjs/web)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/hauselabs/surf/blob/main/LICENSE)

</div>

---

Framework-agnostic runtime that powers `window.surf` — the interface browser-based AI agents use to interact with your website. Zero dependencies.

Commands registered with `@surfjs/web` run **locally in the browser**, modifying UI state directly. No server roundtrip. Instant feedback.

## Install

```bash
npm install @surfjs/web
```

## Usage

```js
import { initSurf, registerCommand } from '@surfjs/web'

// Initialize window.surf (with optional server fallback)
initSurf({ endpoint: 'https://myapp.com' })

// Register a local command handler
registerCommand('canvas.addCircle', {
  mode: 'local',  // browser-only, no server call
  run: (params) => {
    addCircleToCanvas(params)
    return { ok: true }
  }
})

// Now agents (or devtools) can run:
// await window.surf.execute('canvas.addCircle', { x: 200, radius: 50 })
```

## Modes

| Mode | Behavior |
|------|----------|
| `'local'` | Runs only in browser. No server call. |
| `'sync'` | Runs in browser, then POSTs to server in background for persistence. |

If no local handler is registered, `window.surf.execute()` falls back to the server endpoint.

## Framework Wrappers

`@surfjs/web` is the engine. Framework packages are thin wrappers:

- **React:** `@surfjs/react` — `useSurfCommands()` hook
- **Vue:** `@surfjs/vue` — `useSurfCommands()` composable
- **Svelte:** `@surfjs/svelte` — `surfCommands()` function

## API

| Function | Description |
|----------|-------------|
| `initSurf(options?)` | Install `window.surf` with optional HTTP endpoint |
| `registerCommand(name, config)` | Register local handler, returns cleanup fn |
| `unregisterCommand(name)` | Remove handler by name |
| `getSurf()` | Get current `window.surf` instance |
| `destroySurf()` | Tear down everything |

## Part of Surf

[Website](https://surf.codes) · [Docs](https://surf.codes/docs) · [GitHub](https://github.com/hauselabs/surf)
