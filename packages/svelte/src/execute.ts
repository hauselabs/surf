import { ensureSurf } from '@surfjs/web';
import type { SurfExecuteResult } from '@surfjs/web';

/**
 * Execute a Surf command via `window.surf.execute()`.
 *
 * Convenience wrapper that ensures `window.surf` is initialized before calling.
 * Routes through local handlers first, falls back to server.
 *
 * @param command - Command name to execute
 * @param params - Optional parameters
 * @returns The execution result
 */
export async function surfExecute(
  command: string,
  params?: Record<string, unknown>,
): Promise<SurfExecuteResult> {
  const surf = ensureSurf();
  return surf.execute(command, params);
}
