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
   * Emit a custom event to all clients subscribed to a channel.
   */
  emit(event: string, data: unknown, channelId: string): void;
}

export interface SurfInstance {
  use(middleware: SurfMiddleware): void;
  manifest(): SurfManifest;
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

  let liveVersion = 0;
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
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { WebSocketServer } = require('ws') as typeof import('ws');
        const wss = new WebSocketServer({ server: server as never });
        attachWebSocket(wss, {
          registry,
          sessions: sessionStore,
          events: eventBus,
          live: config.live,
        });
      } catch {
        throw new Error(
          '@surfjs/core: WebSocket transport requires the "ws" package. Install it: pnpm add ws',
        );
      }
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
          liveVersion++;
          eventBus.emitToChannel('surf:state', { channel: channelId, state, version: liveVersion }, channelId);
        },
        patchState(channelId: string, patch: unknown) {
          liveVersion++;
          eventBus.emitToChannel('surf:patch', { channel: channelId, patch, version: liveVersion }, channelId);
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
