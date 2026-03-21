'use client';

import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { SurfContext, type SurfContextValue, type EventCallback } from './context.js';

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

/**
 * Manage channel subscriptions dynamically.
 *
 * @returns Object with subscribe/unsubscribe functions and current channels set.
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
 * Also supports `surf:patch` events for incremental updates (shallow merge).
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
        return { ...prev, ...typed.patch } as T;
      }
      return prev;
    });
  }, [key]));

  return [state, setState];
}
