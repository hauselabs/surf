import { writable, type Writable } from 'svelte/store';
import { onDestroy } from 'svelte';
import { deepMerge } from './deepMerge.js';
import { getSurfContext } from './context.js';

/** Data shape for surf:state events. */
interface StateEventData {
  channel: string;
  state: unknown;
  version: number;
}

/** Data shape for surf:patch events. */
interface PatchEventData {
  channel: string;
  patch: Record<string, unknown>;
  version: number;
}

/**
 * Synced state store that auto-updates from Surf Live broadcast events.
 *
 * Listens for `surf:state` events and updates the store when received.
 * Also supports `surf:patch` events for incremental updates (deep merge).
 *
 * Must be called within a component that has SurfProvider context.
 *
 * @param key - Key to filter state events (matches against channel name)
 * @param initialState - Initial state value
 * @returns A Svelte writable store that auto-updates from server
 */
export function surfState<T>(key: string, initialState: T): Writable<T> {
  const store = writable<T>(initialState);
  const ctx = getSurfContext();
  let version = 0;

  // Listen for full state updates
  const unsubState = ctx.subscribe('surf:state', (data: unknown) => {
    const typed = data as StateEventData;
    if (typed.channel !== key) return;
    if (typed.version <= version) return;
    version = typed.version;
    store.set(typed.state as T);
  });

  // Listen for patch updates
  const unsubPatch = ctx.subscribe('surf:patch', (data: unknown) => {
    const typed = data as PatchEventData;
    if (typed.channel !== key) return;
    if (typed.version <= version) return;
    version = typed.version;
    store.update(prev => {
      if (typeof prev === 'object' && prev !== null && typeof typed.patch === 'object') {
        return deepMerge(prev as Record<string, unknown>, typed.patch) as T;
      }
      return prev;
    });
  });

  onDestroy(() => {
    unsubState();
    unsubPatch();
  });

  return store;
}
