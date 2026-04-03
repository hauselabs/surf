// ─── Utilities ────────────────────────────────────────────────────────────────

export { deepMerge } from './deepMerge.js';

// ─── Public API ───────────────────────────────────────────────────────────────

export {
  initSurf,
  registerCommand,
  unregisterCommand,
  getSurf,
  destroySurf,
} from './runtime.js';

// ─── Framework integration helpers ────────────────────────────────────────────

export {
  setServerExecutor,
  setServerStatus,
  setManifestUrl,
  ensureSurf,
} from './runtime.js';

// ─── Types ────────────────────────────────────────────────────────────────────

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
} from './types.js';
