import type { Session, SessionStore } from './types.js';
import { sessionExpired } from './errors.js';

let idCounter = 0;
function generateId(): string {
  return `sess_${Date.now().toString(36)}_${(++idCounter).toString(36)}`;
}

/**
 * In-memory session store. Good for development and single-process apps.
 * Implement SessionStore interface for Redis/database-backed sessions.
 */
export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, Session>();
  private readonly ttlMs: number;

  constructor(ttlMs = 30 * 60 * 1000) {
    this.ttlMs = ttlMs;
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

  private cleanup(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastAccessedAt > this.ttlMs) {
        this.sessions.delete(id);
      }
    }
  }
}
