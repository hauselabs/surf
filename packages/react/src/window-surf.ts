/**
 * window.surf — Browser Agent Interface
 *
 * Registers a global `window.surf` object that browser-based AI agents
 * use to discover and execute Surf commands. This is the primary way
 * agents interact with Surf-enabled websites from within a browser.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SurfGlobalCommand {
  description: string;
  params?: Record<string, unknown>;
}

export interface SurfManifest {
  name?: string;
  commands: Record<string, unknown>;
}

export interface SurfExecuteResult {
  ok: boolean;
  result?: unknown;
  error?: unknown;
}

export interface SurfGlobal {
  /** Execute a Surf command. */
  execute(command: string, params?: Record<string, unknown>): Promise<SurfExecuteResult>;
  /** Fetch the full manifest from the server. */
  manifest(): Promise<SurfManifest>;
  /** Available commands (populated from manifest). */
  commands: Record<string, SurfGlobalCommand>;
  /** Connection status. */
  status: 'connected' | 'disconnected' | 'connecting';
  /** Surf protocol version. */
  version: string;
}

// ─── Global type declaration ──────────────────────────────────────────────────

declare global {
  interface Window {
    surf?: SurfGlobal;
  }
}

// ─── Protocol version ─────────────────────────────────────────────────────────

const SURF_VERSION = '0.2';

// ─── WebSocket-backed implementation (used by SurfProvider) ───────────────────

interface WsExecutor {
  execute: (command: string, params?: Record<string, unknown>) => Promise<SurfExecuteResult>;
  getStatus: () => 'connected' | 'disconnected' | 'connecting';
}

export function registerWindowSurfWs(
  wsExecutor: WsExecutor,
  endpoint?: string,
): () => void {
  if (typeof window === 'undefined') return () => {};

  let cachedManifest: SurfManifest | null = null;
  let commandsCache: Record<string, SurfGlobalCommand> = {};

  // Pre-fetch manifest if endpoint is available
  const manifestUrl = endpoint
    ? `${endpoint.replace(/\/$/, '')}/.well-known/surf.json`
    : null;

  const fetchManifest = async (): Promise<SurfManifest> => {
    if (cachedManifest) return cachedManifest;
    if (!manifestUrl) {
      return { commands: {} };
    }
    const res = await fetch(manifestUrl);
    if (!res.ok) throw new Error(`Failed to fetch manifest: ${res.status}`);
    const data = await res.json();
    cachedManifest = data as SurfManifest;
    // Populate commands cache
    if (cachedManifest.commands) {
      commandsCache = {};
      for (const [name, def] of Object.entries(cachedManifest.commands)) {
        const cmd = def as Record<string, unknown>;
        commandsCache[name] = {
          description: (cmd.description as string) ?? '',
          params: cmd.params as Record<string, unknown> | undefined,
        };
      }
    }
    return cachedManifest;
  };

  // Attempt to load manifest in background
  if (manifestUrl) {
    fetchManifest().catch(() => {/* silent — manifest is optional for WS mode */});
  }

  const surfGlobal: SurfGlobal = {
    async execute(command: string, params?: Record<string, unknown>): Promise<SurfExecuteResult> {
      return wsExecutor.execute(command, params);
    },
    async manifest(): Promise<SurfManifest> {
      return fetchManifest();
    },
    get commands() {
      return commandsCache;
    },
    get status() {
      return wsExecutor.getStatus();
    },
    version: SURF_VERSION,
  };

  window.surf = surfGlobal;

  return () => {
    if (window.surf === surfGlobal) {
      delete window.surf;
    }
  };
}

// ─── HTTP-only implementation (used by SurfBadge without SurfProvider) ────────

export function registerWindowSurfHttp(endpoint: string): () => void {
  if (typeof window === 'undefined') return () => {};

  // Don't overwrite a WebSocket-backed instance
  if (window.surf && window.surf.status === 'connected') return () => {};

  const baseUrl = endpoint.replace(/\/$/, '');
  const manifestUrl = `${baseUrl}/.well-known/surf.json`;
  let cachedManifest: SurfManifest | null = null;
  let commandsCache: Record<string, SurfGlobalCommand> = {};

  const fetchManifest = async (): Promise<SurfManifest> => {
    if (cachedManifest) return cachedManifest;
    const res = await fetch(manifestUrl);
    if (!res.ok) throw new Error(`Failed to fetch manifest: ${res.status}`);
    const data = await res.json();
    cachedManifest = data as SurfManifest;
    if (cachedManifest.commands) {
      commandsCache = {};
      for (const [name, def] of Object.entries(cachedManifest.commands)) {
        const cmd = def as Record<string, unknown>;
        commandsCache[name] = {
          description: (cmd.description as string) ?? '',
          params: cmd.params as Record<string, unknown> | undefined,
        };
      }
    }
    return cachedManifest;
  };

  // Pre-fetch
  fetchManifest().catch(() => {/* silent */});

  const surfGlobal: SurfGlobal = {
    async execute(command: string, params?: Record<string, unknown>): Promise<SurfExecuteResult> {
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
    },
    async manifest(): Promise<SurfManifest> {
      return fetchManifest();
    },
    get commands() {
      return commandsCache;
    },
    get status() {
      return 'disconnected' as const;
    },
    version: SURF_VERSION,
  };

  window.surf = surfGlobal;

  return () => {
    if (window.surf === surfGlobal) {
      delete window.surf;
    }
  };
}
