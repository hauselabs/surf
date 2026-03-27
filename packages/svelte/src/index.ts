// ─── Provider ─────────────────────────────────────────────────────────────────

export { createSurfProvider } from './provider.js';
export type { CreateSurfProviderOptions } from './provider.js';

// ─── Context ──────────────────────────────────────────────────────────────────

export { setSurfContext, getSurfContext } from './context.js';

// ─── Commands ─────────────────────────────────────────────────────────────────

export { surfCommands } from './commands.js';
export type { SurfCommandConfig, SurfCommandsMap } from './commands.js';

// ─── State ────────────────────────────────────────────────────────────────────

export { surfState } from './state.js';

// ─── Execute ──────────────────────────────────────────────────────────────────

export { surfExecute } from './execute.js';

// ─── window.surf (re-exported from @surfjs/web) ──────────────────────────────

export { initSurf, registerCommand, unregisterCommand, getSurf, destroySurf, ensureSurf } from '@surfjs/web';
export type {
  SurfGlobal,
  SurfGlobalCommand,
  SurfManifest,
  SurfExecuteResult,
  LocalHandler,
  LocalHandlerMode,
  ServerExecutor,
  InitSurfOptions,
  CommandConfig,
} from '@surfjs/web';

// ─── Types ────────────────────────────────────────────────────────────────────

export type { SurfContextValue, ConnectionStatus, SurfResult, EventCallback } from './types.js';
