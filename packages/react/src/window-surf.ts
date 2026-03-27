/**
 * @deprecated — All window.surf logic has moved to @surfjs/web.
 * This file re-exports for backward compatibility with SurfProvider/SurfBadge internals.
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

// ─── Compatibility wrappers for SurfProvider / SurfBadge ──────────────────────

import {
  initSurf,
  setServerExecutor,
  setServerStatus,
  setManifestUrl,
  ensureSurf,
} from '@surfjs/web';
import type { SurfExecuteResult } from '@surfjs/web';

interface WsExecutor {
  execute: (command: string, params?: Record<string, unknown>) => Promise<SurfExecuteResult>;
  getStatus: () => 'connected' | 'disconnected' | 'connecting';
}

/**
 * Register window.surf with a WebSocket-backed server executor.
 * Used by SurfProvider.
 */
export function registerWindowSurfWs(
  wsExecutor: WsExecutor,
  endpoint?: string,
): () => void {
  if (typeof window === 'undefined') return () => {};

  ensureSurf();

  if (endpoint) {
    setManifestUrl(`${endpoint.replace(/\/$/, '')}/.well-known/surf.json`);
  }

  const cleanupExecutor = setServerExecutor((command, params) =>
    wsExecutor.execute(command, params),
  );

  setServerStatus(wsExecutor.getStatus());

  const statusInterval = setInterval(() => {
    setServerStatus(wsExecutor.getStatus());
  }, 500);

  return () => {
    clearInterval(statusInterval);
    cleanupExecutor();
    setServerStatus('disconnected');
  };
}

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
