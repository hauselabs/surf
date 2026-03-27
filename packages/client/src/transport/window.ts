import type { SurfManifest, SurfResponse, SurfErrorCode } from '../types.js';
import { isSurfErrorCode } from '../types.js';

type EventCallback = (data: unknown) => void;

interface WindowSurf {
  discover(): SurfManifest;
  execute(command: string, params?: Record<string, unknown>): Promise<unknown>;
  subscribe(event: string, callback: EventCallback): () => void;
  authenticate(token: string): void;
}

declare global {
  interface Window {
    __surf__?: WindowSurf;
  }
}

/**
 * In-browser transport using window.__surf__.
 * For agents running inside the browser context (browser extensions, injected scripts).
 */
export class WindowTransport {
  private surf: WindowSurf | null = null;

  /**
   * Connect to the in-page Surf runtime.
   */
  async connect(): Promise<void> {
    if (typeof window === 'undefined') {
      throw new Error('WindowTransport only works in browser environments');
    }

    if (window.__surf__) {
      this.surf = window.__surf__;
      return;
    }

    // Wait for surf:ready event
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for window.__surf__'));
      }, 5000);

      window.addEventListener('surf:ready', () => {
        clearTimeout(timeout);
        if (window.__surf__) {
          this.surf = window.__surf__;
          resolve();
        } else {
          reject(new Error('surf:ready fired but window.__surf__ not found'));
        }
      }, { once: true });
    });
  }

  /**
   * Get the manifest from the in-page runtime.
   */
  discover(): SurfManifest {
    if (!this.surf) throw new Error('Not connected');
    return this.surf.discover();
  }

  /**
   * Execute a command via the in-page runtime.
   */
  async execute(command: string, params?: Record<string, unknown>): Promise<SurfResponse> {
    if (!this.surf) throw new Error('Not connected');

    try {
      const result = await this.surf.execute(command, params);
      return { ok: true, result };
    } catch (e) {
      const rawCode =
        e != null &&
        typeof e === 'object' &&
        'code' in e &&
        typeof (e as Record<string, unknown>)['code'] === 'string'
          ? ((e as Record<string, string>)['code'])
          : undefined;

      const errCode: SurfErrorCode =
        rawCode !== undefined && isSurfErrorCode(rawCode) ? rawCode : 'INTERNAL_ERROR';
      const errMsg = e instanceof Error ? e.message : 'Unknown error';

      return {
        ok: false,
        error: {
          code: errCode,
          message: errMsg,
        },
      };
    }
  }

  /**
   * Subscribe to events from the in-page runtime.
   */
  on(event: string, callback: EventCallback): () => void {
    if (!this.surf) throw new Error('Not connected');
    return this.surf.subscribe(event, callback);
  }

  /**
   * Authenticate with the in-page runtime.
   */
  authenticate(token: string): void {
    if (!this.surf) throw new Error('Not connected');
    this.surf.authenticate(token);
  }

  get connected(): boolean {
    return this.surf !== null;
  }
}
