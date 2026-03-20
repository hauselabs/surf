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
  readonly events: EventBus;
  readonly sessions: SessionStore;
  readonly commands: CommandRegistry;
}

export function createSurf(config: SurfConfig): SurfInstance {
  const validateReturns = config.strict === true || config.validateReturns === true;
  const registry = new CommandRegistry(config.commands, {
    validateReturns,
    globalRateLimit: config.rateLimit,
  });
  const sessionStore = new InMemorySessionStore();
  const eventBus = new EventBus(config.events);
  const manifestData = generateManifest(config);

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

    manifest() {
      return manifestData;
    },

    manifestHandler() {
      return createManifestHandler(manifestData);
    },

    httpHandler() {
      return executeHandler;
    },

    middleware() {
      return createMiddleware(manifestData, executeHandler, sessionHandlers, { registry, sessions: sessionStore, getAuth });
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
