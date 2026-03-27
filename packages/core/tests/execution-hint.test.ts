import { describe, it, expect } from 'vitest';
import { createSurf } from '../src/surf.js';

describe('execution hint', () => {
  it('should include execution hint in manifest', async () => {
    const surf = await createSurf({
      name: 'Test App',
      commands: {
        'canvas.addCircle': {
          description: 'Add a circle to the canvas',
          hints: { execution: 'browser', sideEffects: true },
          run: () => ({ ok: true }),
        },
        'data.fetch': {
          description: 'Fetch data from server',
          hints: { execution: 'server', idempotent: true },
          run: () => ({ items: [] }),
        },
        'search': {
          description: 'Search anything',
          hints: { execution: 'any' },
          run: () => ({ results: [] }),
        },
        'noHint': {
          description: 'No execution hint',
          run: () => null,
        },
      },
    });

    const manifest = surf.manifest();

    expect(manifest.commands['canvas.addCircle'].hints?.execution).toBe('browser');
    expect(manifest.commands['canvas.addCircle'].hints?.sideEffects).toBe(true);
    expect(manifest.commands['data.fetch'].hints?.execution).toBe('server');
    expect(manifest.commands['data.fetch'].hints?.idempotent).toBe(true);
    expect(manifest.commands['search'].hints?.execution).toBe('any');
    expect(manifest.commands['noHint'].hints).toBeUndefined();
  });

  it('should expose execution hint via CommandRegistry', async () => {
    const surf = await createSurf({
      name: 'Test App',
      commands: {
        'browser.only': {
          description: 'Browser-only command',
          hints: { execution: 'browser' },
          run: () => ({ ok: true }),
        },
      },
    });

    const cmd = surf.commands.get('browser.only');
    expect(cmd).toBeDefined();
    expect(cmd!.hints?.execution).toBe('browser');
  });
});
