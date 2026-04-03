import type { SurfInstance } from '@surfjs/core';
import { getErrorStatus } from '@surfjs/core';

// Re-export the centralised getErrorStatus from core
export { getErrorStatus };

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
