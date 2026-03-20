import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../src/events.js';

describe('EventBus', () => {
  describe('basic pub/sub', () => {
    it('delivers events to subscribers', () => {
      const bus = new EventBus({ ping: { description: 'test' } });
      const cb = vi.fn();
      bus.on('ping', cb);
      bus.emit('ping', { hello: 'world' });
      expect(cb).toHaveBeenCalledWith({ hello: 'world' });
    });

    it('unsubscribe stops delivery', () => {
      const bus = new EventBus({ ping: { description: 'test' } });
      const cb = vi.fn();
      const unsub = bus.on('ping', cb);
      unsub();
      bus.emit('ping', 'data');
      expect(cb).not.toHaveBeenCalled();
    });

    it('off() removes all listeners for an event', () => {
      const bus = new EventBus({ ping: { description: 'test' } });
      const cb = vi.fn();
      bus.on('ping', cb);
      bus.off('ping');
      bus.emit('ping', 'data');
      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('session scoping', () => {
    it('session-scoped events only go to the matching session', () => {
      const bus = new EventBus({
        'order.completed': { description: 'Order done', scope: 'session' },
      });

      const sessionA = vi.fn();
      const sessionB = vi.fn();

      bus.on('order.completed', sessionA, 'sess-A');
      bus.on('order.completed', sessionB, 'sess-B');

      // Emit for session A only
      bus.emit('order.completed', { orderId: '123' }, 'sess-A');

      expect(sessionA).toHaveBeenCalledWith({ orderId: '123' });
      expect(sessionB).not.toHaveBeenCalled();
    });

    it('default scope is session when not specified', () => {
      const bus = new EventBus({
        'cart.updated': { description: 'Cart changed' }, // no scope = default 'session'
      });

      const sessionA = vi.fn();
      const sessionB = vi.fn();

      bus.on('cart.updated', sessionA, 'sess-A');
      bus.on('cart.updated', sessionB, 'sess-B');

      bus.emit('cart.updated', { items: 3 }, 'sess-A');

      expect(sessionA).toHaveBeenCalled();
      expect(sessionB).not.toHaveBeenCalled();
    });

    it('global events go to all sessions', () => {
      const bus = new EventBus({
        'system.maintenance': { description: 'Maintenance mode', scope: 'global' },
      });

      const sessionA = vi.fn();
      const sessionB = vi.fn();

      bus.on('system.maintenance', sessionA, 'sess-A');
      bus.on('system.maintenance', sessionB, 'sess-B');

      bus.emit('system.maintenance', { downAt: '2024-01-01' });

      expect(sessionA).toHaveBeenCalled();
      expect(sessionB).toHaveBeenCalled();
    });

    it('broadcast events go to all sessions', () => {
      const bus = new EventBus({
        'price.changed': { description: 'Price update', scope: 'broadcast' },
      });

      const sessionA = vi.fn();
      const sessionB = vi.fn();

      bus.on('price.changed', sessionA, 'sess-A');
      bus.on('price.changed', sessionB, 'sess-B');

      bus.emit('price.changed', { sku: 'ABC', price: 9.99 }, 'sess-A');

      expect(sessionA).toHaveBeenCalled();
      expect(sessionB).toHaveBeenCalled();
    });

    it('unscoped listeners (server-side) always receive session events', () => {
      const bus = new EventBus({
        'order.completed': { description: 'Order done', scope: 'session' },
      });

      const serverListener = vi.fn(); // no sessionId = server-side
      const sessionA = vi.fn();

      bus.on('order.completed', serverListener); // no session
      bus.on('order.completed', sessionA, 'sess-A');

      bus.emit('order.completed', { orderId: '456' }, 'sess-A');

      expect(serverListener).toHaveBeenCalled(); // server always gets events
      expect(sessionA).toHaveBeenCalled();
    });

    it('removeSession cleans up all listeners for that session', () => {
      const bus = new EventBus({
        'event1': { description: 'test1' },
        'event2': { description: 'test2' },
      });

      const cb1 = vi.fn();
      const cb2 = vi.fn();

      bus.on('event1', cb1, 'sess-X');
      bus.on('event2', cb2, 'sess-X');

      bus.removeSession('sess-X');

      bus.emit('event1', 'data', 'sess-X');
      bus.emit('event2', 'data', 'sess-X');

      expect(cb1).not.toHaveBeenCalled();
      expect(cb2).not.toHaveBeenCalled();
    });

    it('removeSession does not affect other sessions', () => {
      const bus = new EventBus({
        'ping': { description: 'test' },
      });

      const cbA = vi.fn();
      const cbB = vi.fn();

      bus.on('ping', cbA, 'sess-A');
      bus.on('ping', cbB, 'sess-B');

      bus.removeSession('sess-A');

      bus.emit('ping', 'data', 'sess-B');

      expect(cbA).not.toHaveBeenCalled();
      expect(cbB).toHaveBeenCalled();
    });
  });

  describe('error isolation', () => {
    it('one listener throwing does not break other listeners', () => {
      const bus = new EventBus({ ping: { description: 'test', scope: 'global' } });

      const badCb = vi.fn(() => { throw new Error('boom'); });
      const goodCb = vi.fn();

      bus.on('ping', badCb, 'sess-A');
      bus.on('ping', goodCb, 'sess-B');

      bus.emit('ping', 'data');

      expect(badCb).toHaveBeenCalled();
      expect(goodCb).toHaveBeenCalled();
    });
  });
});
