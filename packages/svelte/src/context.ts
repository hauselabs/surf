import { getContext, setContext } from 'svelte';
import type { SurfContextValue } from './types.js';

const SURF_CONTEXT_KEY = Symbol('surf');

/**
 * Set the Surf context value (used internally by createSurfProvider).
 */
export function setSurfContext(value: SurfContextValue): void {
  setContext(SURF_CONTEXT_KEY, value);
}

/**
 * Get the Surf context value. Throws if used outside SurfProvider.
 */
export function getSurfContext(): SurfContextValue {
  const ctx = getContext<SurfContextValue>(SURF_CONTEXT_KEY);
  if (!ctx) {
    throw new Error('getSurfContext must be used within a SurfProvider component');
  }
  return ctx;
}
