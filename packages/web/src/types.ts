/**
 * Types for the window.surf local execution runtime.
 */

/** A command listed in the manifest / commands map. */
export interface SurfGlobalCommand {
  description: string;
  params?: Record<string, unknown>;
}

/** Manifest shape returned by window.surf.manifest(). */
export interface SurfManifest {
  name?: string;
  commands: Record<string, unknown>;
}

/** Result from executing a command via window.surf.execute(). */
export interface SurfExecuteResult {
  ok: boolean;
  result?: unknown;
  error?: unknown;
}

/** The window.surf global interface exposed to browser agents. */
export interface SurfGlobal {
  /** Execute a Surf command — routes to local handler first, falls back to server. */
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

/** Handler mode: 'local' = browser only, 'sync' = local + POST to server in background. */
export type LocalHandlerMode = 'local' | 'sync';

/** A local command handler function. */
export type LocalHandler = (params: Record<string, unknown>) => unknown | Promise<unknown>;

/** Server executor function type (set by framework integrations). */
export type ServerExecutor = (command: string, params?: Record<string, unknown>) => Promise<SurfExecuteResult>;

/** Options for initSurf(). */
export interface InitSurfOptions {
  /** HTTP endpoint for manifest discovery and server fallback (e.g. "https://myapp.com"). */
  endpoint?: string;
}

/** Configuration for a command handler passed to registerCommand(). */
export interface CommandConfig {
  /**
   * Execution mode: 'local' (browser only) or 'sync' (local + server background sync).
   * Defaults to `'local'` if omitted.
   */
  mode?: LocalHandlerMode;
  /** The handler function that executes the command locally. */
  run: LocalHandler;
}

// ─── Global type declaration ──────────────────────────────────────────────────

declare global {
  interface Window {
    surf?: SurfGlobal;
  }
}
