import type { SurfInstance } from '@surfjs/core';

/**
 * Surf error code to HTTP status code mapping.
 * Consistent with fastify and hono adapters.
 */
export function getErrorStatus(code: string): number {
  switch (code) {
    case 'UNKNOWN_COMMAND': return 404;
    case 'NOT_FOUND': return 404;
    case 'INVALID_PARAMS': return 400;
    case 'AUTH_REQUIRED': return 401;
    case 'AUTH_FAILED': return 403;
    case 'SESSION_EXPIRED': return 410;
    case 'RATE_LIMITED': return 429;
    case 'NOT_SUPPORTED': return 501;
    default: return 500;
  }
}

/**
 * Extract Bearer token from an Authorization header value.
 *
 * @param authHeader - Raw Authorization header value
 * @returns The token string, or `undefined` if not present
 */
export function extractAuth(authHeader: string | null | undefined): string | undefined {
  if (!authHeader) return undefined;
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
}

/**
 * Extract client IP from forwarding headers.
 *
 * @param forwardedFor - `x-forwarded-for` header value
 * @param realIp - `x-real-ip` header value
 * @returns The client IP string, or `undefined` if not determinable
 */
export function extractIp(
  forwardedFor: string | null | undefined,
  realIp: string | null | undefined,
): string | undefined {
  if (forwardedFor) return forwardedFor.split(',')[0]?.trim();
  return realIp ?? undefined;
}

/**
 * CORS headers applied to all Surf responses.
 * @deprecated Use `resolveCorsHeaders()` from the SurfInstance for configurable CORS.
 */
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
};

/**
 * Safely extract a `sessionId` string from an unknown request body.
 *
 * Returns the sessionId string if present and string-typed, otherwise undefined.
 */
export function extractSessionId(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const raw = (body as Record<string, unknown>)['sessionId'];
  return typeof raw === 'string' ? raw : undefined;
}

/**
 * Common types re-exported for internal use.
 */
export type { SurfInstance };
