/**
 * Compatibility helpers for SurfProvider / SurfBadge internals.
 * Re-exports from @surfjs/web with convenience wrappers.
 */

export {
  initSurf,
  ensureSurf,
  setServerExecutor,
  setServerStatus,
  setManifestUrl,
  destroySurf,
} from '@surfjs/web';

export type {
  SurfGlobal,
  SurfGlobalCommand,
  SurfManifest,
  SurfExecuteResult,
  LocalHandler,
  LocalHandlerMode,
  ServerExecutor,
} from '@surfjs/web';

import {
  initSurf,
  ensureSurf,
} from '@surfjs/web';

/**
 * Register window.surf with an HTTP-only server executor.
 * Used by SurfBadge when no SurfProvider is present.
 */
export function registerWindowSurfHttp(endpoint: string): () => void {
  if (typeof window === 'undefined') return () => {};

  // Don't overwrite a WS-backed executor (status 'connected' means WS is active)
  const surf = ensureSurf();
  if (surf.status === 'connected') return () => {};

  initSurf({ endpoint });

  return () => {
    // HTTP executor cleanup is handled by initSurf / destroySurf
  };
}
