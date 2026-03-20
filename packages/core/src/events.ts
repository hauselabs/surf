import type { EventDefinition } from './types.js';

type EventCallback = (data: unknown) => void;

/**
 * Scope for event delivery:
 * - `'global'` — broadcast to all subscribers (e.g. system announcements)
 * - `'session'` — only deliver to the session that triggered it
 * - `'broadcast'` — deliver to all sessions (legacy, opt-in)
 */
export type EventScope = 'global' | 'session' | 'broadcast';

export interface ScopedEventDefinition extends EventDefinition {
  /** Who receives this event. Default: `'session'` */
  scope?: EventScope;
}

interface ScopedCallback {
  callback: EventCallback;
  sessionId?: string;
}

/**
 * Session-aware event emitter for Surf events.
 *
 * By default, events are scoped to the session that triggered them.
 * Use `scope: 'global'` for system-wide broadcasts (e.g. maintenance announcements).
 * Use `scope: 'broadcast'` to send to all connected clients.
 */
export class EventBus {
  private readonly definitions: ReadonlyMap<string, ScopedEventDefinition>;
  private readonly listeners = new Map<string, Set<ScopedCallback>>();

  constructor(events?: Record<string, EventDefinition | ScopedEventDefinition>) {
    this.definitions = new Map(Object.entries(events ?? {}));
  }

  /**
   * Subscribe to an event, optionally scoped to a session.
   * If `sessionId` is provided, only events emitted for that session
   * (or global/broadcast events) will be delivered.
   *
   * Returns an unsubscribe function.
   */
  on(event: string, callback: EventCallback, sessionId?: string): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    const entry: ScopedCallback = { callback, sessionId };
    set.add(entry);
    return () => set.delete(entry);
  }

  /**
   * Emit an event with session scoping.
   *
   * @param event - Event name
   * @param data - Event payload
   * @param sessionId - The session that triggered this event (for session-scoped delivery)
   */
  emit(event: string, data: unknown, sessionId?: string): void {
    const set = this.listeners.get(event);
    if (!set) return;

    const def = this.definitions.get(event);
    const scope: EventScope = (def as ScopedEventDefinition)?.scope ?? 'session';

    for (const entry of set) {
      const shouldDeliver = this.shouldDeliver(scope, entry.sessionId, sessionId);
      if (!shouldDeliver) continue;

      try {
        entry.callback(data);
      } catch {
        // Swallow listener errors — don't break emit loop
      }
    }
  }

  /**
   * Determine whether an event should be delivered to a specific listener.
   */
  private shouldDeliver(
    scope: EventScope,
    listenerSessionId: string | undefined,
    emitterSessionId: string | undefined,
  ): boolean {
    switch (scope) {
      case 'global':
      case 'broadcast':
        // Global/broadcast events go to everyone
        return true;

      case 'session':
        // Session-scoped: deliver if no listener session (unscoped subscriber),
        // or if the listener's session matches the emitter's session
        if (!listenerSessionId) return true; // server-side listeners always get events
        if (!emitterSessionId) return true; // no session context = deliver to all
        return listenerSessionId === emitterSessionId;

      default:
        return true;
    }
  }

  /**
   * Remove all listeners for an event, or all events.
   */
  off(event?: string): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Remove all listeners for a specific session (cleanup on disconnect).
   */
  removeSession(sessionId: string): void {
    for (const [, set] of this.listeners) {
      for (const entry of set) {
        if (entry.sessionId === sessionId) {
          set.delete(entry);
        }
      }
    }
  }

  hasDefinition(event: string): boolean {
    return this.definitions.has(event);
  }

  getDefinitions(): ReadonlyMap<string, EventDefinition> {
    return this.definitions;
  }

  getScope(event: string): EventScope {
    const def = this.definitions.get(event) as ScopedEventDefinition | undefined;
    return def?.scope ?? 'session';
  }
}
