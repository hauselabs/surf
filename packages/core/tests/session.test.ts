import { describe, it, expect } from 'vitest';
import { InMemorySessionStore } from '../src/session.js';

describe('InMemorySessionStore', () => {
  it('creates a session and returns an ID', async () => {
    const store = new InMemorySessionStore();
    const session = await store.create();
    expect(session.id).toBeDefined();
    expect(typeof session.id).toBe('string');
    expect(session.id.startsWith('sess_')).toBe(true);
    expect(session.state).toEqual({});
  });

  it('gets a session by ID', async () => {
    const store = new InMemorySessionStore();
    const session = await store.create();
    const retrieved = await store.get(session.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(session.id);
  });

  it('returns undefined for non-existent session', async () => {
    const store = new InMemorySessionStore();
    const retrieved = await store.get('nonexistent');
    expect(retrieved).toBeUndefined();
  });

  it('updates session state', async () => {
    const store = new InMemorySessionStore();
    const session = await store.create();

    await store.update(session.id, { cart: ['item1', 'item2'] });

    const retrieved = await store.get(session.id);
    expect(retrieved!.state).toEqual({ cart: ['item1', 'item2'] });
  });

  it('destroys a session', async () => {
    const store = new InMemorySessionStore();
    const session = await store.create();
    await store.destroy(session.id);

    const retrieved = await store.get(session.id);
    expect(retrieved).toBeUndefined();
  });

  it('creates unique session IDs', async () => {
    const store = new InMemorySessionStore();
    const s1 = await store.create();
    const s2 = await store.create();
    expect(s1.id).not.toBe(s2.id);
  });

  // ── Legacy constructor compatibility ────────────────────────────────

  it('accepts ttlMs as a number (legacy signature)', async () => {
    const store = new InMemorySessionStore(1000);
    const session = await store.create();
    expect(await store.get(session.id)).toBeDefined();
  });

  // ── maxSessions limit & LRU eviction ───────────────────────────────

  it('accepts options object with maxSessions', async () => {
    const store = new InMemorySessionStore({ maxSessions: 5 });
    const session = await store.create();
    expect(await store.get(session.id)).toBeDefined();
  });

  it('evicts oldest sessions when maxSessions is exceeded', async () => {
    const store = new InMemorySessionStore({ maxSessions: 3 });

    const s1 = await store.create();
    const s2 = await store.create();
    const s3 = await store.create();

    // All three should be accessible
    expect(await store.get(s1.id)).toBeDefined();
    expect(await store.get(s2.id)).toBeDefined();
    expect(await store.get(s3.id)).toBeDefined();

    // Creating a 4th should evict the least-recently-used (s1 was accessed first above,
    // but get() re-inserts — so after the three gets above, order is s1, s2, s3 by last access.
    // Actually Map insertion order after gets: s1 re-inserted first, then s2, then s3.
    // So s1 is oldest in Map order.)
    const s4 = await store.create();

    // s1 should have been evicted (oldest in Map)
    expect(await store.get(s1.id)).toBeUndefined();

    // s2, s3, s4 should still exist
    expect(await store.get(s2.id)).toBeDefined();
    expect(await store.get(s3.id)).toBeDefined();
    expect(await store.get(s4.id)).toBeDefined();
  });

  it('evicts LRU sessions — recently accessed sessions survive', async () => {
    const store = new InMemorySessionStore({ maxSessions: 3 });

    const s1 = await store.create();
    const s2 = await store.create();
    const s3 = await store.create();

    // Access s1 to make it most-recently-used
    await store.get(s1.id);

    // Now Map order is: s2, s3, s1 (s1 re-inserted at end)
    const s4 = await store.create(); // should evict s2

    expect(await store.get(s2.id)).toBeUndefined(); // evicted
    expect(await store.get(s1.id)).toBeDefined();    // survived (recently used)
    expect(await store.get(s3.id)).toBeDefined();
    expect(await store.get(s4.id)).toBeDefined();
  });

  it('handles maxSessions of 1', async () => {
    const store = new InMemorySessionStore({ maxSessions: 1 });

    const s1 = await store.create();
    expect(await store.get(s1.id)).toBeDefined();

    const s2 = await store.create();
    expect(await store.get(s1.id)).toBeUndefined(); // evicted
    expect(await store.get(s2.id)).toBeDefined();
  });

  it('evicts multiple sessions at once when far over limit', async () => {
    const store = new InMemorySessionStore({ maxSessions: 2 });

    const sessions = [];
    for (let i = 0; i < 5; i++) {
      sessions.push(await store.create());
    }

    // Only the last 2 should survive
    for (let i = 0; i < 3; i++) {
      expect(await store.get(sessions[i].id)).toBeUndefined();
    }
    expect(await store.get(sessions[3].id)).toBeDefined();
    expect(await store.get(sessions[4].id)).toBeDefined();
  });

  it('defaults maxSessions to 10000', async () => {
    const store = new InMemorySessionStore();
    // Just verify we can create sessions without eviction at small scale
    const sessions = [];
    for (let i = 0; i < 20; i++) {
      sessions.push(await store.create());
    }
    // All should still be accessible
    for (const s of sessions) {
      expect(await store.get(s.id)).toBeDefined();
    }
  });
});
