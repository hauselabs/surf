import { inject, onUnmounted, ref, type Ref } from 'vue';
import { registerCommand } from '@surfjs/web';
import type { CommandConfig } from '@surfjs/web';
import { deepMerge } from './deepMerge.js';
import { SURF_INJECTION_KEY } from './provider.js';
import type { SurfContextValue, EventCallback } from './types.js';

// ─── useSurf ──────────────────────────────────────────────────────────────────

/**
 * Access the Surf context. Throws if used outside SurfProvider.
 */
export function useSurf(): SurfContextValue {
  const ctx = inject(SURF_INJECTION_KEY);
  if (!ctx) {
    throw new Error('useSurf must be used within a <SurfProvider>');
  }
  return ctx;
}

// ─── useSurfEvent ─────────────────────────────────────────────────────────────

/**
 * Subscribe to a Surf event. Automatically cleans up on unmount.
 *
 * @param event - Event name to subscribe to (e.g. 'timeline.updated')
 * @param callback - Called when the event fires
 */
export function useSurfEvent(event: string, callback: EventCallback): void {
  const ctx = inject(SURF_INJECTION_KEY);
  if (!ctx) return;

  const unsub = ctx.subscribe(event, callback);
  onUnmounted(unsub);
}

// ─── useSurfChannel ───────────────────────────────────────────────────────────

/**
 * Manage channel subscriptions dynamically.
 *
 * @returns Object with subscribe/unsubscribe functions and current channels ref.
 */
export function useSurfChannel() {
  const ctx = useSurf();

  return {
    /** Subscribe to a channel. */
    subscribe: ctx.subscribeChannel,
    /** Unsubscribe from a channel. */
    unsubscribe: ctx.unsubscribeChannel,
    /** Currently subscribed channels. */
    channels: ctx.channels,
  };
}

// ─── useSurfState ─────────────────────────────────────────────────────────────

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
 * Synced state composable that auto-updates from Surf Live broadcast events.
 *
 * Listens for `surf:state` events and updates local state when received.
 * Also supports `surf:patch` events for incremental updates (deep merge).
 *
 * @param key - Optional key to filter state events (matches against channel name)
 * @param initialState - Initial state value
 * @returns A reactive ref that auto-updates from server
 */
export function useSurfState<T>(key: string, initialState: T): Ref<T> {
  const state = ref(initialState) as Ref<T>;
  let version = 0;

  // Listen for full state updates
  useSurfEvent('surf:state', (data: unknown) => {
    const typed = data as StateEventData;
    if (typed.channel !== key) return;
    if (typed.version <= version) return;
    version = typed.version;
    state.value = typed.state as T;
  });

  // Listen for patch updates
  useSurfEvent('surf:patch', (data: unknown) => {
    const typed = data as PatchEventData;
    if (typed.channel !== key) return;
    if (typed.version <= version) return;
    version = typed.version;
    const prev = state.value;
    if (typeof prev === 'object' && prev !== null && typeof typed.patch === 'object') {
      state.value = deepMerge(prev as Record<string, unknown>, typed.patch) as T;
    }
  });

  return state;
}

// ─── useSurfCommands ──────────────────────────────────────────────────────────

/** Configuration for a single command handler. */
export type SurfCommandConfig = CommandConfig;

/** Map of command names to their configurations. */
export type SurfCommandsMap = Record<string, SurfCommandConfig>;

/**
 * Register local command handlers with `window.surf`.
 *
 * Handlers run IN the browser, modifying local state directly.
 * No server roundtrip for `mode: 'local'` commands.
 * For `mode: 'sync'`, the handler runs locally AND the command is
 * also POSTed to the server in the background for persistence.
 *
 * Works with or without `<SurfProvider>` — registers directly with `window.surf`
 * via `@surfjs/web`.
 *
 * @example
 * ```ts
 * useSurfCommands({
 *   'canvas.addCircle': {
 *     mode: 'local',
 *     run: (params) => {
 *       store.addCircle(params)
 *       return { ok: true }
 *     }
 *   },
 *   'doc.save': {
 *     mode: 'sync',
 *     run: (params) => {
 *       store.saveLocal(params)
 *       return { ok: true }
 *     }
 *   }
 * })
 * ```
 */
export function useSurfCommands(commands: SurfCommandsMap): void {
  const cleanups = Object.entries(commands).map(
    ([name, config]) => registerCommand(name, config),
  );

  onUnmounted(() => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  });
}
