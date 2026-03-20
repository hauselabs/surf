import type { SurfResponse } from '../types.js';

export interface HttpTransportOptions {
  baseUrl: string;
  auth?: string;
  fetch: typeof globalThis.fetch;
}

/**
 * HTTP transport for executing Surf commands via POST /surf/execute.
 */
export class HttpTransport {
  private readonly baseUrl: string;
  private readonly auth?: string;
  private readonly fetch: typeof globalThis.fetch;

  constructor(options: HttpTransportOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.auth = options.auth;
    this.fetch = options.fetch;
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

    const response = await this.fetch(`${this.baseUrl}/surf/execute`, {
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
