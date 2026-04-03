'use client';

import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { SurfContext, type SurfContextValue, type EventCallback } from './context.js';
import { deepMerge } from './deepMerge.js';
import { registerCommand } from '@surfjs/web';
import type { CommandConfig } from '@surfjs/web';

/**
 * Access the Surf context. Throws if used outside SurfProvider.
 */
export function useSurf(): SurfContextValue {
  const ctx = useContext(SurfContext);
  if (!ctx) {
    throw new Error('useSurf must be used within a <SurfProvider>');
  }
  return ctx;
}

/**
 * Subscribe to a Surf event. Automatically cleans up on unmount.
 *
 * @param event - Event name to subscribe to (e.g. 'timeline.updated')
 * @param callback - Called when the event fires
 */
export function useSurfEvent(event: string, callback: EventCallback): void {
  const ctx = useContext(SurfContext);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!ctx) return;

    const handler: EventCallback = (data) => {
      callbackRef.current(data);
    };

    return ctx.subscribe(event, handler);
  }, [ctx, event]);
}

/** Controls returned by the {@link useSurfChannel} hook. */
export interface SurfChannelControls {
  /** Subscribe to a channel. */
  subscribe: (channelId: string) => void;
  /** Unsubscribe from a channel. */
  unsubscribe: (channelId: string) => void;
  /** Currently subscribed channels. */
  channels: ReadonlySet<string>;
}

/**
 * Manage channel subscriptions dynamically.
 *
 * @returns Object with subscribe/unsubscribe functions and current channels set.
 */
export function useSurfChannel(): SurfChannelControls {
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
 * Synced state hook that auto-updates from Surf Live broadcast events.
 *
 * Listens for `surf:state` events and updates local state when received.
 * Also supports `surf:patch` events for incremental updates (deep merge).
 *
 * @param key - Optional key to filter state events (matches against channel name)
 * @param initialState - Initial state value
 * @returns [state, setState] tuple — state updates automatically from server
 */
export function useSurfState<T>(key: string, initialState: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(initialState);
  const versionRef = useRef(0);

  // Listen for full state updates
  useSurfEvent('surf:state', useCallback((data: unknown) => {
    const typed = data as StateEventData;
    if (typed.channel !== key) return;
    if (typed.version <= versionRef.current) return; // dedup
    versionRef.current = typed.version;
    setState(typed.state as T);
  }, [key]));

  // Listen for patch updates
  useSurfEvent('surf:patch', useCallback((data: unknown) => {
    const typed = data as PatchEventData;
    if (typed.channel !== key) return;
    if (typed.version <= versionRef.current) return; // dedup
    versionRef.current = typed.version;
    setState(prev => {
      if (typeof prev === 'object' && prev !== null && typeof typed.patch === 'object') {
        return deepMerge(prev as Record<string, unknown>, typed.patch) as T;
      }
      return prev;
    });
  }, [key]));

  return [state, setState];
}

// ─── useSurfCommands ──────────────────────────────────────────────────────────

/** Configuration for a single command handler in useSurfCommands. */
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
 * ```tsx
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
  const commandsRef = useRef(commands);
  commandsRef.current = commands;

  useEffect(() => {
    const cleanups = Object.entries(commandsRef.current).map(
      ([name, config]) => registerCommand(name, config),
    );

    return () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, []);
}
