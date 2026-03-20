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
});
