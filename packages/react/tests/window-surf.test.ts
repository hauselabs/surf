import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock window for Node.js environment
const mockWindow = {} as { surf?: unknown };
vi.stubGlobal('window', mockWindow);

// Import from @surfjs/web (the actual runtime)
const {
  initSurf,
  registerCommand,
  unregisterCommand,
  getSurf,
  destroySurf,
  setServerExecutor,
  ensureSurf,
} = await import('@surfjs/web');

describe('window.surf local execution runtime (@surfjs/web)', () => {
  beforeEach(() => {
    destroySurf();
  });

  it('should install window.surf global via initSurf()', () => {
    initSurf();
    const surf = getSurf();
    expect(surf).toBeDefined();
    expect(mockWindow.surf).toBe(surf);
    expect(surf!.version).toBe('0.2');
  });

  it('should return same instance on repeated calls', () => {
    const s1 = ensureSurf();
    const s2 = ensureSurf();
    expect(s2).toBe(s1);
  });

  describe('local handlers', () => {
    it('should execute a registered local handler', async () => {
      const handler = vi.fn(() => ({ circles: 1 }));
      registerCommand('canvas.addCircle', { mode: 'local', run: handler });

      const surf = ensureSurf();
      const result = await surf.execute('canvas.addCircle', { x: 10, y: 20 });

      expect(result.ok).toBe(true);
      expect(result.result).toEqual({ circles: 1 });
      expect(handler).toHaveBeenCalledWith({ x: 10, y: 20 });
    });

    it('should handle async local handlers', async () => {
      const handler = vi.fn(async () => {
        return { ok: true, result: { saved: true } };
      });
      registerCommand('doc.save', { mode: 'local', run: handler });

      const surf = ensureSurf();
      const result = await surf.execute('doc.save', {});

      expect(result.ok).toBe(true);
      expect(result.result).toEqual({ saved: true });
    });

    it('should normalize results that return ok/result shape', async () => {
      registerCommand('items.count', {
        mode: 'local',
        run: () => ({ ok: true, result: { count: 5 } }),
      });

      const surf = ensureSurf();
      const result = await surf.execute('items.count');

      expect(result.ok).toBe(true);
      expect(result.result).toEqual({ count: 5 });
    });

    it('should wrap non-execute-result returns', async () => {
      registerCommand('greet', { mode: 'local', run: () => 'hello' });

      const surf = ensureSurf();
      const result = await surf.execute('greet');

      expect(result.ok).toBe(true);
      expect(result.result).toBe('hello');
    });

    it('should catch errors from local handlers', async () => {
      registerCommand('crasher', {
        mode: 'local',
        run: () => { throw new Error('boom'); },
      });

      const surf = ensureSurf();
      const result = await surf.execute('crasher');

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        code: 'INTERNAL_ERROR',
        message: 'boom',
      });
    });

    it('should unregister handlers via returned cleanup', async () => {
      const handler = vi.fn(() => 'ok');
      const cleanup = registerCommand('temp', { mode: 'local', run: handler });

      cleanup();

      const surf = ensureSurf();
      const result = await surf.execute('temp');
      expect(result.ok).toBe(false);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should unregister via unregisterCommand', async () => {
      const handler = vi.fn(() => 'ok');
      registerCommand('temp2', { mode: 'local', run: handler });

      unregisterCommand('temp2');

      const surf = ensureSurf();
      const result = await surf.execute('temp2');
      expect(result.ok).toBe(false);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('local handler priority over server', () => {
    it('should prefer local handler over server executor', async () => {
      const serverExecutor = vi.fn(async () => ({ ok: true, result: 'from-server' }));
      ensureSurf();
      setServerExecutor(serverExecutor);

      const localHandler = vi.fn(() => 'from-local');
      registerCommand('test.cmd', { mode: 'local', run: localHandler });

      const surf = getSurf()!;
      const result = await surf.execute('test.cmd', { x: 1 });

      expect(result.ok).toBe(true);
      expect(result.result).toBe('from-local');
      expect(localHandler).toHaveBeenCalled();
      expect(serverExecutor).not.toHaveBeenCalled();
    });
  });

  describe('server fallback', () => {
    it('should fall back to server when no local handler', async () => {
      const serverExecutor = vi.fn(async () => ({
        ok: true,
        result: { items: [] },
      }));
      ensureSurf();
      setServerExecutor(serverExecutor);

      const surf = getSurf()!;
      const result = await surf.execute('server.only', { limit: 10 });

      expect(result.ok).toBe(true);
      expect(result.result).toEqual({ items: [] });
      expect(serverExecutor).toHaveBeenCalledWith('server.only', { limit: 10 });
    });

    it('should return NOT_SUPPORTED when no handler and no server', async () => {
      ensureSurf();

      const surf = getSurf()!;
      const result = await surf.execute('unknown.cmd');

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        code: 'NOT_SUPPORTED',
        message: 'No handler registered for "unknown.cmd"',
      });
    });
  });

  describe('sync mode', () => {
    it('should run locally AND fire to server in background with mode: sync', async () => {
      const serverExecutor = vi.fn(async () => ({ ok: true }));
      ensureSurf();
      setServerExecutor(serverExecutor);

      const localHandler = vi.fn(() => ({ ok: true, result: { saved: true } }));
      registerCommand('doc.save', { mode: 'sync', run: localHandler });

      const surf = getSurf()!;
      const result = await surf.execute('doc.save', { content: 'hello' });

      expect(result.ok).toBe(true);
      expect(result.result).toEqual({ saved: true });
      expect(localHandler).toHaveBeenCalledWith({ content: 'hello' });

      // Give the background fire-and-forget a tick
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(serverExecutor).toHaveBeenCalledWith('doc.save', { content: 'hello' });
    });

    it('should not fail if server sync errors in sync mode', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const serverExecutor = vi.fn(async () => { throw new Error('network error'); });
      ensureSurf();
      setServerExecutor(serverExecutor);

      const localHandler = vi.fn(() => ({ ok: true }));
      registerCommand('doc.save', { mode: 'sync', run: localHandler });

      const surf = getSurf()!;
      const result = await surf.execute('doc.save', {});

      expect(result.ok).toBe(true);
      expect(localHandler).toHaveBeenCalled();

      await new Promise(resolve => setTimeout(resolve, 10));
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should skip server sync when no server executor in sync mode', async () => {
      ensureSurf();

      const localHandler = vi.fn(() => ({ ok: true }));
      registerCommand('doc.save', { mode: 'sync', run: localHandler });

      const surf = getSurf()!;
      const result = await surf.execute('doc.save', {});

      expect(result.ok).toBe(true);
      expect(localHandler).toHaveBeenCalled();
    });
  });

  describe('destroySurf', () => {
    it('should clean up everything', () => {
      initSurf();
      registerCommand('test', { mode: 'local', run: () => null });

      destroySurf();

      expect(mockWindow.surf).toBeUndefined();
      expect(getSurf()).toBeUndefined();
    });
  });
});
