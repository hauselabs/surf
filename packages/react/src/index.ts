// ─── Provider ─────────────────────────────────────────────────────────────────

export { SurfProvider } from './provider.js';
export type { SurfProviderProps } from './provider.js';

// ─── Hooks ────────────────────────────────────────────────────────────────────

export { useSurf, useSurfEvent, useSurfChannel, useSurfState, useSurfCommands } from './hooks.js';
export type { SurfCommandConfig, SurfCommandsMap } from './hooks.js';

// ─── Components ───────────────────────────────────────────────────────────────

export { SurfBadge } from './SurfBadge.js';
export type { SurfBadgeProps, SurfBadgeCommand } from './SurfBadge.js';

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

export type { SurfContextValue, ConnectionStatus, SurfResult, EventCallback } from './context.js';
