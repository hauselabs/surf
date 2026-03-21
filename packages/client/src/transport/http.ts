import type { SurfResponse } from '../types.js';

export interface HttpTransportOptions {
  baseUrl: string;
  auth?: string;
  fetch: typeof globalThis.fetch;
  /**
   * Base path for the Surf execute endpoint. Default: '/surf/execute'.
   * Override to '/api/surf/execute' when using @surfjs/next.
   */
  basePath?: string;
}

/** Default execute path — matches the built-in core middleware mount point. */
const DEFAULT_EXECUTE_PATH = '/surf/execute';

/**
 * HTTP transport for executing Surf commands via POST /surf/execute.
 */
export class HttpTransport {
  private readonly baseUrl: string;
  private readonly auth?: string;
  private readonly fetch: typeof globalThis.fetch;
  private readonly executePath: string;

  constructor(options: HttpTransportOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.auth = options.auth;
    this.fetch = options.fetch;
    this.executePath = options.basePath ?? DEFAULT_EXECUTE_PATH;
  }

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
    });

    const data = (await response.json()) as { ok: boolean; sessionId?: string };
    if (!data.ok || !data.sessionId) {
      throw new Error('Failed to start session');
    }
    return data.sessionId;
  }

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
