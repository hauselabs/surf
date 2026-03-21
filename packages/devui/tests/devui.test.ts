import { describe, it, expect, afterEach } from 'vitest';
import { createSurf } from '@surfjs/core';
import { createDevUI } from '../src/server.js';
import type { DevUI } from '../src/server.js';

async function makeSurf() {
  return await createSurf({
    name: 'Test Store',
    commands: {
      search: {
        description: 'Search products',
        params: { query: { type: 'string', required: true } },
        run: async ({ query }) => [{ name: 'Test Product', query }],
      },
      'cart.add': {
        description: 'Add to cart',
        params: {
          sku: { type: 'string', required: true },
          quantity: { type: 'number', default: 1 },
        },
        auth: 'optional',
        run: async ({ sku, quantity }) => ({ added: true, sku, quantity }),
      },
      checkout: {
        description: 'Complete purchase',
        auth: 'required',
        run: async () => ({ orderId: 'ORD-123', status: 'confirmed' }),
      },
    },
  });
}

describe('createDevUI', () => {
  let devui: DevUI | null = null;

  afterEach(async () => {
    if (devui) {
      await devui.stop();
      devui = null;
    }
  });

  it('returns an object with start, stop, and middleware methods', async () => {
    const surf = await makeSurf();
    devui = createDevUI(surf);
    expect(devui).toBeDefined();
    expect(typeof devui.start).toBe('function');
    expect(typeof devui.stop).toBe('function');
    expect(typeof devui.middleware).toBe('function');
  });

  it('middleware() returns a function', async () => {
    const surf = await makeSurf();
    devui = createDevUI(surf);
    const mw = devui.middleware();
    expect(typeof mw).toBe('function');
  });

  it('start() creates server on specified port', async () => {
    const surf = await makeSurf();
    devui = createDevUI(surf, { port: 14242 });
    const { url } = await devui.start();
    expect(url).toBe('http://localhost:14242/__surf');
  });

  it('serves HTML at /__surf with manifest data', async () => {
    const surf = await makeSurf();
    devui = createDevUI(surf, { port: 14243 });
    await devui.start();

    const res = await fetch('http://localhost:14243/__surf');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');

    const html = await res.text();
    expect(html).toContain('Test Store');
    expect(html).toContain('Surf DevUI');
    expect(html).toContain('search');
    expect(html).toContain('cart.add');
    expect(html).toContain('checkout');
  });

  it('serves manifest JSON at /__surf/manifest', async () => {
    const surf = await makeSurf();
    devui = createDevUI(surf, { port: 14244 });
    await devui.start();

    const res = await fetch('http://localhost:14244/__surf/manifest');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');

    const manifest = await res.json();
    expect(manifest.name).toBe('Test Store');
    expect(manifest.commands).toBeDefined();
    expect(manifest.commands.search).toBeDefined();
    expect(manifest.commands['cart.add']).toBeDefined();
  });

  it('redirects / to /__surf', async () => {
    const surf = await makeSurf();
    devui = createDevUI(surf, { port: 14245 });
    await devui.start();

    const res = await fetch('http://localhost:14245/', { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/__surf');
  });

  it('executes commands via /surf/execute', async () => {
    const surf = await makeSurf();
    devui = createDevUI(surf, { port: 14246 });
    await devui.start();

    const res = await fetch('http://localhost:14246/surf/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'search', params: { query: 'hello' } }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.result).toEqual([{ name: 'Test Product', query: 'hello' }]);
  });

  it('returns AUTH_REQUIRED for auth commands without token', async () => {
    const surf = await makeSurf();
    devui = createDevUI(surf, { port: 14247 });
    await devui.start();

    const res = await fetch('http://localhost:14247/surf/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'checkout', params: {} }),
    });

    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error.code).toBe('AUTH_REQUIRED');
  });

  it('executes auth commands with bearer token', async () => {
    const surf = await makeSurf();
    devui = createDevUI(surf, { port: 14248 });
    await devui.start();

    const res = await fetch('http://localhost:14248/surf/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token',
      },
      body: JSON.stringify({ command: 'checkout', params: {} }),
    });

    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.result).toEqual({ orderId: 'ORD-123', status: 'confirmed' });
  });

  it('returns 404 for unknown paths', async () => {
    const surf = await makeSurf();
    devui = createDevUI(surf, { port: 14249 });
    await devui.start();

    const res = await fetch('http://localhost:14249/unknown');
    expect(res.status).toBe(404);
  });

  it('supports custom mount path', async () => {
    const surf = await makeSurf();
    devui = createDevUI(surf, { port: 14250, path: '/__dev' });
    const { url } = await devui.start();
    expect(url).toBe('http://localhost:14250/__dev');

    const res = await fetch('http://localhost:14250/__dev');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Test Store');
  });

  it('stop() cleanly shuts down the server', async () => {
    const surf = await makeSurf();
    devui = createDevUI(surf, { port: 14251 });
    await devui.start();

    // Verify it's running
    const res = await fetch('http://localhost:14251/__surf');
    expect(res.status).toBe(200);

    await devui.stop();
    devui = null;

    // Verify it's stopped
    await expect(fetch('http://localhost:14251/__surf')).rejects.toThrow();
  });

  it('HTML includes keyboard shortcut handlers', async () => {
    const surf = await makeSurf();
    devui = createDevUI(surf, { port: 14252 });
    await devui.start();

    const res = await fetch('http://localhost:14252/__surf');
    const html = await res.text();
    expect(html).toContain('keydown');
    expect(html).toContain('isInputFocused');
    expect(html).toContain('⌘↵');
  });
});
