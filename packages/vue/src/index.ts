// ─── Provider ─────────────────────────────────────────────────────────────────

export { SurfProvider } from './provider.js';
export { SURF_INJECTION_KEY } from './provider.js';

// ─── Composables ──────────────────────────────────────────────────────────────

export { useSurf, useSurfEvent, useSurfChannel, useSurfState, useSurfCommands } from './composables.js';
export type { SurfCommandConfig, SurfCommandsMap } from './composables.js';

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

export type { SurfContextValue, ConnectionStatus, SurfResult, EventCallback } from './types.js';
