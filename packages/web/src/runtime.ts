/**
 * window.surf — Local Execution Runtime
 *
 * Framework-agnostic dispatcher with a local handler registry.
 * Commands route to locally registered handlers first, then fall back
 * to the server executor (HTTP or WebSocket, set by framework wrappers).
 *
 * Architecture:
 *   window.surf.execute('cmd', params)
 *     ├─ Local handler registered? → Run it locally → UI updates instantly
 *     │     └─ mode: 'sync'? → Also POST to server for persistence
 *     └─ No local handler? → POST to server (fallback)
 */

import type {
  SurfGlobal,
  SurfGlobalCommand,
  SurfManifest,
  SurfExecuteResult,
  LocalHandler,
  LocalHandlerMode,
  ServerExecutor,
  InitSurfOptions,
  CommandConfig,
} from './types.js';

// ─── Protocol version ─────────────────────────────────────────────────────────

const SURF_VERSION = '0.2';

// ─── Internal state (module-scoped singletons) ────────────────────────────────

interface RegisteredHandler {
  handler: LocalHandler;
  mode: LocalHandlerMode;
}

const localHandlers = new Map<string, RegisteredHandler>();

let serverExecutor: ServerExecutor | null = null;
let serverStatus: 'connected' | 'disconnected' | 'connecting' = 'disconnected';

let cachedManifest: SurfManifest | null = null;
let commandsCache: Record<string, SurfGlobalCommand> = {};
let manifestUrl: string | null = null;

let surfInstance: SurfGlobal | null = null;

// ─── Manifest fetching ───────────────────────────────────────────────────────

async function fetchManifest(): Promise<SurfManifest> {
  if (cachedManifest) return cachedManifest;
  if (!manifestUrl) return { commands: {} };

  const res = await fetch(manifestUrl);
  if (!res.ok) throw new Error(`Failed to fetch manifest: ${res.status}`);
  const data = await res.json();
  cachedManifest = data as SurfManifest;
  if (cachedManifest.commands) {
    commandsCache = {};
    for (const [name, def] of Object.entries(cachedManifest.commands)) {
      const cmd = isPlainObject(def) ? def : {};
      const rawDesc = cmd['description'];
      const rawParams = cmd['params'];
      commandsCache[name] = {
        description: typeof rawDesc === 'string' ? rawDesc : '',
        params: isPlainObject(rawParams) ? rawParams : undefined,
      };
    }
  }
  return cachedManifest;
}

// ─── Type guards ─────────────────────────────────────────────────────────────

function isExecuteResult(value: unknown): value is SurfExecuteResult {
  return typeof value === 'object' && value !== null && 'ok' in value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ─── Build the SurfGlobal instance ────────────────────────────────────────────

function createSurfGlobal(): SurfGlobal {
  return {
    async execute(command: string, params?: Record<string, unknown>): Promise<SurfExecuteResult> {
      const resolvedParams = params ?? {};

      // 1. Check local handler first
      const registered = localHandlers.get(command);
      if (registered) {
        try {
          const localResult = await registered.handler(resolvedParams);
          const result: SurfExecuteResult = isExecuteResult(localResult)
            ? localResult
            : { ok: true, result: localResult };

          // If mode is 'sync', also fire to server in background
          if (registered.mode === 'sync' && serverExecutor) {
            serverExecutor(command, resolvedParams).catch((err) => {
              console.error(`[surf] Background sync failed for "${command}":`, err);
            });
          }

          return result;
        } catch (err) {
          return {
            ok: false,
            error: {
              code: 'INTERNAL_ERROR',
              message: err instanceof Error ? err.message : 'Local handler error',
            },
          };
        }
      }

      // 2. Fall back to server executor
      if (serverExecutor) {
        return serverExecutor(command, resolvedParams);
      }

      // 3. No handler registered
      return {
        ok: false,
        error: {
          code: 'NOT_SUPPORTED',
          message: `No handler registered for "${command}"`,
        },
      };
    },

    async manifest(): Promise<SurfManifest> {
      return fetchManifest();
    },

    get commands() {
      return commandsCache;
    },

    get status() {
      return serverStatus;
    },

    version: SURF_VERSION,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialize window.surf. Idempotent — safe to call multiple times.
 * Sets up the dispatcher and optionally configures the server endpoint
 * for manifest discovery and HTTP fallback.
 */
export function initSurf(options?: InitSurfOptions): void {
  if (typeof window === 'undefined') return;

  if (!surfInstance) {
    surfInstance = createSurfGlobal();
  }

  window.surf = surfInstance;

  if (options?.endpoint) {
    const baseUrl = options.endpoint.replace(/\/$/, '');
    manifestUrl = `${baseUrl}/.well-known/surf.json`;

    // Set up HTTP fallback executor if none is set
    if (!serverExecutor) {
      serverExecutor = async (command, params) => {
        const res = await fetch(`${baseUrl}/surf/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command, params: params ?? {} }),
        });
        const data = await res.json();
        return {
          ok: data.ok ?? res.ok,
          result: data.result,
          error: data.error,
        };
      };
    }

    // Pre-fetch manifest
    fetchManifest().catch(() => {/* silent */});
  }
}

/**
 * Register a local command handler. Returns an unregister function.
 *
 * Automatically calls initSurf() if window.surf isn't set up yet.
 *
 * @example
 * ```js
 * const cleanup = registerCommand('canvas.addCircle', {
 *   mode: 'local',
 *   run: (params) => { addCircle(params); return { ok: true } }
 * })
 * // Later: cleanup()
 * ```
 */
export function registerCommand(name: string, config: CommandConfig): () => void {
  // Auto-init if needed
  if (typeof window !== 'undefined' && !window.surf) {
    initSurf();
  }

  localHandlers.set(name, { handler: config.run, mode: config.mode ?? 'local' });

  return () => {
    const current = localHandlers.get(name);
    if (current?.handler === config.run) {
      localHandlers.delete(name);
    }
  };
}

/**
 * Unregister a local command handler by name.
 */
export function unregisterCommand(name: string): void {
  localHandlers.delete(name);
}

/**
 * Get the current window.surf instance, or undefined if not initialized.
 */
export function getSurf(): SurfGlobal | undefined {
  if (typeof window === 'undefined') return surfInstance ?? undefined;
  return window.surf;
}

/**
 * Tear down window.surf completely. Clears all handlers and state.
 * Primarily for testing.
 */
export function destroySurf(): void {
  localHandlers.clear();
  serverExecutor = null;
  serverStatus = 'disconnected';
  cachedManifest = null;
  commandsCache = {};
  manifestUrl = null;
  surfInstance = null;
  if (typeof window !== 'undefined') {
    delete window.surf;
  }
}

// ─── Framework integration helpers ────────────────────────────────────────────
// These are used by @surfjs/react, @surfjs/vue, etc. — not by end users.

/**
 * Set the server executor. Used by framework wrappers (SurfProvider, SurfBadge)
 * to provide WebSocket or HTTP-based server fallback.
 *
 * @returns Cleanup function that removes this executor (if it's still active).
 */
export function setServerExecutor(executor: ServerExecutor): () => void {
  serverExecutor = executor;
  return () => {
    if (serverExecutor === executor) {
      serverExecutor = null;
    }
  };
}

/**
 * Update the connection status. Used by framework wrappers
 * to reflect WebSocket connection state.
 */
export function setServerStatus(status: 'connected' | 'disconnected' | 'connecting'): void {
  serverStatus = status;
}

/**
 * Set the manifest URL directly. Used by framework wrappers.
 */
export function setManifestUrl(url: string): void {
  manifestUrl = url;
  cachedManifest = null; // Invalidate cache
  fetchManifest().catch(() => {/* silent */});
}

/**
 * Ensure the SurfGlobal instance exists (creates if needed).
 * Used by framework wrappers that need the instance before full init.
 */
export function ensureSurf(): SurfGlobal {
  if (!surfInstance) {
    surfInstance = createSurfGlobal();
  }
  if (typeof window !== 'undefined' && !window.surf) {
    window.surf = surfInstance;
  }
  return surfInstance;
}
