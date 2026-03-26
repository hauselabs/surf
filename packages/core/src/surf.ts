import type {
  SurfConfig,
  SurfManifest,
  HttpHandler,
  SessionStore,
} from './types.js';
import type { SurfMiddleware } from './middleware.js';
import { CommandRegistry } from './commands.js';
import { generateManifest } from './manifest.js';
import { InMemorySessionStore } from './session.js';
import { deepMerge } from './deepMerge.js';
import { EventBus } from './events.js';
import { createAuthMiddleware } from './auth.js';
import {
  createManifestHandler,
  createExecuteHandler,
  createMiddleware,
  createSessionHandlers,
} from './transport/http.js';
import { attachWebSocket } from './transport/websocket.js';
import { generateBrowserScript, createWindowBridge } from './transport/window.js';

/** Surf Live state sync API — available on SurfInstance when live is enabled. */
export interface SurfLive {
  /**
   * Push full state to all clients subscribed to a channel.
   * Clients using `useSurfState()` auto-update.
   */
  setState(channelId: string, state: unknown): void;
  /**
   * Push a partial state patch to all clients subscribed to a channel.
   * Clients can apply the patch incrementally.
   */
  patchState(channelId: string, patch: unknown): void;
  /**
   * Get the last known state for a channel (for initial delivery on subscribe).
   */
  getState(channelId: string): { state: unknown; version: number } | undefined;
  /**
   * Emit a custom event to all clients subscribed to a channel.
   */
  emit(event: string, data: unknown, channelId: string): void;
}

export interface SurfInstance {
  use(middleware: SurfMiddleware): void;
  manifest(options?: { authenticated?: boolean }): SurfManifest;
  /** Get the appropriate manifest for a given auth token. Returns authed manifest (with hidden commands) if token is valid. */
  manifestForToken(token: string | undefined): Promise<SurfManifest>;
  manifestHandler(): HttpHandler;
  httpHandler(): HttpHandler;
  middleware(): HttpHandler;
  wsHandler(server: { on: (...args: unknown[]) => void }): void;
  browserScript(): string;
  browserBridge(): string;
  emit(event: string, data: unknown): void;
  /** Surf Live real-time state sync. Only available when `live.enabled` is true. */
  readonly live: SurfLive;
  readonly events: EventBus;
  readonly sessions: SessionStore;
  readonly commands: CommandRegistry;
}

export async function createSurf(config: SurfConfig): Promise<SurfInstance> {
  // Eagerly try to load ws for WebSocket support (works in both CJS and ESM)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let WsServer: any;
  try {
    const ws = await import('ws') as any;
    WsServer = ws.WebSocketServer ?? ws.default?.WebSocketServer;
  } catch {
    // ws not installed — wsHandler() will throw a clear error if called
  }

  const validateReturns = config.strict === true || config.validateReturns === true;
  const debug = config.debug === true;
  const registry = new CommandRegistry(config.commands, {
    validateReturns,
    globalRateLimit: config.rateLimit,
    debug,
  });
  const sessionStore = new InMemorySessionStore();
  const eventBus = new EventBus(config.events);
  const manifestData = await generateManifest(config);
  const manifestDataAuthed = await generateManifest(config, { authenticated: true });

  const channelVersions = new Map<string, number>();
  const channelStates = new Map<string, unknown>();
  function nextVersion(channelId: string): number {
    const v = (channelVersions.get(channelId) ?? 0) + 1;
    channelVersions.set(channelId, v);
    return v;
  }
  const middlewareStack: SurfMiddleware[] = [];

  if (config.authVerifier) {
    middlewareStack.push(
      createAuthMiddleware(config.authVerifier, (name) => registry.get(name)),
    );
  }

  if (config.middleware) {
    middlewareStack.push(...config.middleware);
  }

  registry.setMiddleware(middlewareStack);

  const getAuth = (headers: Record<string, string | string[] | undefined>): string | undefined => {
    const auth = headers['authorization'] ?? headers['Authorization'];
    const val = Array.isArray(auth) ? auth[0] : auth;
    if (!val) return undefined;
    return val.startsWith('Bearer ') ? val.slice(7) : val;
  };

  const executeHandler = createExecuteHandler({
    manifest: manifestData,
    registry,
    sessions: sessionStore,
    getAuth,
  });

  const sessionHandlers = createSessionHandlers(sessionStore);

  return {
    use(mw: SurfMiddleware) {
      middlewareStack.push(mw);
      registry.setMiddleware(middlewareStack);
    },

    manifest(options?: { authenticated?: boolean }) {
      return options?.authenticated ? manifestDataAuthed : manifestData;
    },

    async manifestForToken(token: string | undefined): Promise<SurfManifest> {
      const hasHidden = Object.keys(manifestDataAuthed.commands).length > Object.keys(manifestData.commands).length;
      if (!hasHidden || !token || !config.authVerifier) return manifestData;
      try {
        const result = await config.authVerifier(token, '__manifest__');
        return result.valid ? manifestDataAuthed : manifestData;
      } catch {
        return manifestData;
      }
    },

    manifestHandler() {
      // If there are hidden commands, pass both manifests + verifier
      const hasHidden = Object.keys(manifestDataAuthed.commands).length > Object.keys(manifestData.commands).length;
      if (hasHidden) {
        const verifier = config.authVerifier
          ? async (token: string) => { const r = await config.authVerifier!(token, '__manifest__'); return r.valid; }
          : undefined;
        return createManifestHandler(manifestData, manifestDataAuthed, verifier);
      }
      return createManifestHandler(manifestData);
    },

    httpHandler() {
      return executeHandler;
    },

    middleware() {
      const hasHidden = Object.keys(manifestDataAuthed.commands).length > Object.keys(manifestData.commands).length;
      const manifestOpts = hasHidden ? {
        authedManifest: manifestDataAuthed,
        authVerifier: config.authVerifier
          ? async (token: string) => { const r = await config.authVerifier!(token, '__manifest__'); return r.valid; }
          : undefined,
      } : undefined;
      return createMiddleware(manifestData, executeHandler, sessionHandlers, { registry, sessions: sessionStore, getAuth }, manifestOpts);
    },

    wsHandler(server) {
      if (!WsServer) {
        throw new Error(
          '@surfjs/core: WebSocket transport requires the "ws" package. Install it: pnpm add ws',
        );
      }
      const maxPayload = config.live?.maxPayloadBytes ?? 1_048_576; // 1MB default
      const allowedOrigins = config.live?.allowedOrigins;

      const wss = new WsServer({
        server: server as never,
        maxPayload,
        verifyClient: (info: { origin: string; req: unknown }, cb: (result: boolean, code?: number, message?: string) => void) => {
          // Origin checking to prevent Cross-Site WebSocket Hijacking
          if (allowedOrigins && allowedOrigins.length > 0) {
            const origin = info.origin;
            if (!origin || !allowedOrigins.includes(origin)) {
              cb(false, 403, 'Origin not allowed');
              return;
            }
          }
          cb(true);
        },
      });
      attachWebSocket(wss, {
        registry,
        sessions: sessionStore,
        events: eventBus,
        live: config.live,
        getChannelState: (channelId: string) => {
          const state = channelStates.get(channelId);
          const version = channelVersions.get(channelId);
          if (state === undefined || version === undefined) return undefined;
          return { state, version };
        },
      });
    },

    browserScript() {
      return generateBrowserScript(manifestData, registry, eventBus);
    },

    browserBridge() {
      return createWindowBridge(registry, eventBus);
    },

    emit(event: string, data: unknown) {
      eventBus.emit(event, data);
    },

    get live(): SurfLive {
      return {
        setState(channelId: string, state: unknown) {
          channelStates.set(channelId, state);
          const version = nextVersion(channelId);
          eventBus.emitToChannel('surf:state', { channel: channelId, state, version }, channelId);
        },
        patchState(channelId: string, patch: unknown) {
          // Apply deep merge to cached state
          const current = channelStates.get(channelId);
          if (current && typeof current === 'object' && patch && typeof patch === 'object') {
            channelStates.set(channelId, deepMerge(current as Record<string, unknown>, patch as Record<string, unknown>));
          }
          const version = nextVersion(channelId);
          eventBus.emitToChannel('surf:patch', { channel: channelId, patch, version }, channelId);
        },
        /** Get the last known state for a channel (for initial delivery on subscribe). */
        getState(channelId: string): { state: unknown; version: number } | undefined {
          const state = channelStates.get(channelId);
          const version = channelVersions.get(channelId);
          if (state === undefined || version === undefined) return undefined;
          return { state, version };
        },
        emit(event: string, data: unknown, channelId: string) {
          eventBus.emitToChannel(event, data, channelId);
        },
      };
    },

    get events() {
      return eventBus;
    },

    get sessions() {
      return sessionStore;
    },

    get commands() {
      return registry;
    },
  };
}
