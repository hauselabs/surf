import type { SurfResponse } from '../types.js';
import { SurfClientError } from '../client.js';

/**
 * Configuration options for the {@link HttpTransport}.
 */
export interface HttpTransportOptions {
  /** Base URL of the Surf-enabled site (e.g. `'https://example.com'`). */
  baseUrl: string;
  /** Optional Bearer token for authenticated requests. */
  auth?: string;
  /** `fetch` implementation to use for HTTP requests. */
  fetch: typeof globalThis.fetch;
  /**
   * Base path for the Surf execute endpoint. Default: `'/surf/execute'`.
   * Override to `'/api/surf/execute'` when using `@surfjs/next` with App Router.
   */
  basePath?: string;
}

/** Default execute path — matches the built-in core middleware mount point. */
const DEFAULT_EXECUTE_PATH = '/surf/execute';

/**
 * HTTP transport for executing Surf commands via `POST /surf/execute`.
 *
 * Handles JSON serialization, auth headers, session management,
 * and provides the underlying `fetch` implementation to other transports.
 *
 * @example
 * ```ts
 * const http = new HttpTransport({
 *   baseUrl: 'https://example.com',
 *   auth: 'my-token',
 *   fetch: globalThis.fetch,
 * });
 * const response = await http.execute('search', { query: 'shoes' });
 * ```
 */
export class HttpTransport {
  private readonly baseUrl: string;
  private auth?: string;
  private readonly fetch: typeof globalThis.fetch;
  private readonly executePath: string;

  constructor(options: HttpTransportOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.auth = options.auth;
    this.fetch = options.fetch;
    this.executePath = options.basePath ?? DEFAULT_EXECUTE_PATH;
  }

  /**
   * Update the auth token used for subsequent requests.
   *
   * @param token - New Bearer token, or `undefined` to clear auth.
   */
  setAuth(token: string | undefined): void {
    this.auth = token;
  }

  /**
   * Expose the underlying `fetch` implementation for reuse by sibling transports
   * (e.g. pipeline requests that bypass the standard execute path).
   *
   * @returns The configured `fetch` function.
   */
  getFetch(): typeof globalThis.fetch {
    return this.fetch;
  }

  /**
   * Execute a Surf command via HTTP POST.
   *
   * @param command - The command name to execute.
   * @param params - Optional command parameters.
   * @param sessionId - Optional session ID for stateful requests.
   * @param requestId - Optional correlation ID echoed in the response.
   * @returns The raw {@link SurfResponse} from the server.
   */
  async execute(
    command: string,
    params?: Record<string, unknown>,
    sessionId?: string,
    requestId?: string,
  ): Promise<SurfResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.auth) {
      headers['Authorization'] = `Bearer ${this.auth}`;
    }

    const body = JSON.stringify({
      command,
      params: params ?? {},
      ...(sessionId ? { sessionId } : {}),
      ...(requestId ? { requestId } : {}),
    });

    const response = await this.fetch(`${this.baseUrl}${this.executePath}`, {
      method: 'POST',
      headers,
      body,
    });

    return (await response.json()) as SurfResponse;
  }

  /**
   * Start a new session on the server.
   *
   * @returns The server-assigned session ID.
   * @throws {@link SurfClientError} if session creation fails.
   */
  async startSession(): Promise<string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.auth) {
      headers['Authorization'] = `Bearer ${this.auth}`;
    }

    const response = await this.fetch(`${this.baseUrl}/surf/session/start`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });

    const data = (await response.json()) as { ok: boolean; sessionId?: string; error?: { code: string; message: string } };
    if (!data.ok || !data.sessionId) {
      const errCode = data.error?.code;
      const errMsg = data.error?.message ?? 'Failed to start session';
      // If the server returned a Surf error code, pass it through; otherwise use NETWORK_ERROR
      throw new SurfClientError(errMsg, errCode === 'SESSION_EXPIRED' ? 'SESSION_EXPIRED' : 'NETWORK_ERROR', response.status);
    }
    return data.sessionId;
  }

  /**
   * End an active session, releasing server-side resources.
   *
   * @param sessionId - The session ID to terminate.
   */
  async endSession(sessionId: string): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.auth) {
      headers['Authorization'] = `Bearer ${this.auth}`;
    }

    await this.fetch(`${this.baseUrl}/surf/session/end`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ sessionId }),
    });
  }
}
