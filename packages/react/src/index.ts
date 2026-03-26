// ─── Provider ─────────────────────────────────────────────────────────────────

export { SurfProvider } from './provider.js';
export type { SurfProviderProps } from './provider.js';

// ─── Hooks ────────────────────────────────────────────────────────────────────

export { useSurf, useSurfEvent, useSurfChannel, useSurfState } from './hooks.js';

// ─── Components ───────────────────────────────────────────────────────────────

export { SurfBadge } from './SurfBadge.js';
export type { SurfBadgeProps, SurfBadgeCommand } from './SurfBadge.js';

// ─── window.surf ──────────────────────────────────────────────────────────────

export type { SurfGlobal, SurfGlobalCommand, SurfManifest, SurfExecuteResult } from './window-surf.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type { SurfContextValue, ConnectionStatus, SurfResult, EventCallback } from './context.js';
