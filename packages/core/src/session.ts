import type { Session, SessionStore } from './types.js';
import { sessionExpired } from './errors.js';

function generateId(): string {
  return `sess_${crypto.randomUUID()}`;
}

/** Options for {@link InMemorySessionStore}. */
export interface InMemorySessionStoreOptions {
  /** Session time-to-live in milliseconds. Defaults to 30 minutes. */
  ttlMs?: number;
  /** Maximum number of sessions to keep. When exceeded the least-recently-accessed sessions are evicted. Defaults to 10 000. */
  maxSessions?: number;
}

/**
 * In-memory session store with TTL expiration and LRU eviction.
 *
 * Good for development and single-process apps. For production, implement
 * the {@link SessionStore} interface backed by Redis, a database, etc.
 *
 * @example
 * ```ts
 * const store = new InMemorySessionStore({ ttlMs: 60 * 60 * 1000, maxSessions: 1000 });
 * const session = await store.create();
 * await store.update(session.id, { cart: [] });
 * ```
 */
export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, Session>();
  private readonly ttlMs: number;
  private readonly maxSessions: number;

  constructor(options?: number | InMemorySessionStoreOptions) {
    if (typeof options === 'number') {
      // Legacy signature: constructor(ttlMs)
      this.ttlMs = options;
      this.maxSessions = 10_000;
    } else {
      this.ttlMs = options?.ttlMs ?? 30 * 60 * 1000;
      this.maxSessions = options?.maxSessions ?? 10_000;
    }
  }

  async create(): Promise<Session> {
    const now = Date.now();
    const session: Session = {
      id: generateId(),
      state: {},
      createdAt: now,
      lastAccessedAt: now,
    };
    this.sessions.set(session.id, session);
    this.cleanup();
    this.evictIfOverLimit();
    return session;
  }

  async get(id: string): Promise<Session | undefined> {
    const session = this.sessions.get(id);
    if (!session) return undefined;

    if (Date.now() - session.lastAccessedAt > this.ttlMs) {
      this.sessions.delete(id);
      throw sessionExpired(id);
    }

    session.lastAccessedAt = Date.now();

    // Move to end of Map for LRU ordering
    this.sessions.delete(id);
    this.sessions.set(id, session);

    return session;
  }

  async update(id: string, state: Record<string, unknown>): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) {
      throw sessionExpired(id);
    }
    session.state = state;
    session.lastAccessedAt = Date.now();
  }

  async destroy(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  /** Evict least-recently-used sessions when over the limit. */
  private evictIfOverLimit(): void {
    if (this.sessions.size <= this.maxSessions) return;

    // Map iteration order is insertion order.
    // Because we re-insert on access (get), the oldest entries are first.
    const toEvict = this.sessions.size - this.maxSessions;
    let evicted = 0;
    for (const id of this.sessions.keys()) {
      if (evicted >= toEvict) break;
      this.sessions.delete(id);
      evicted++;
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastAccessedAt > this.ttlMs) {
        this.sessions.delete(id);
      }
    }
  }
}
