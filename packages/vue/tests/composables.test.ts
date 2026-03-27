import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock window for Node.js environment
const mockWindow = {} as { surf?: unknown };
vi.stubGlobal('window', mockWindow);

const {
  initSurf,
  registerCommand,
  unregisterCommand,
  getSurf,
  destroySurf,
  setServerExecutor,
  ensureSurf,
} = await import('@surfjs/web');

describe('@surfjs/vue — command registration via @surfjs/web', () => {
  beforeEach(() => {
    destroySurf();
  });

  it('should register and execute a local handler', async () => {
    const handler = vi.fn(() => ({ circles: 1 }));
    const cleanup = registerCommand('canvas.addCircle', { mode: 'local', run: handler });

    const surf = ensureSurf();
    const result = await surf.execute('canvas.addCircle', { x: 10, y: 20 });

    expect(result.ok).toBe(true);
    expect(result.result).toEqual({ circles: 1 });
    expect(handler).toHaveBeenCalledWith({ x: 10, y: 20 });

    cleanup();
  });

  it('should clean up handlers via cleanup function', async () => {
    const handler = vi.fn(() => 'ok');
    const cleanup = registerCommand('temp', { mode: 'local', run: handler });

    cleanup();

    const surf = ensureSurf();
    const result = await surf.execute('temp');
    expect(result.ok).toBe(false);
    expect(handler).not.toHaveBeenCalled();
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

  it('should support sync mode (local + server)', async () => {
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

  it('should unregister via unregisterCommand', async () => {
    const handler = vi.fn(() => 'ok');
    registerCommand('temp2', { mode: 'local', run: handler });

    unregisterCommand('temp2');

    const surf = ensureSurf();
    const result = await surf.execute('temp2');
    expect(result.ok).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('should clean up everything with destroySurf', () => {
    initSurf();
    registerCommand('test', { mode: 'local', run: () => null });

    destroySurf();

    expect(mockWindow.surf).toBeUndefined();
    expect(getSurf()).toBeUndefined();
  });
});
