// ─── HTTP Status Mapping ─────────────────────────────────────────────────────
// Centralised error-code → HTTP-status mapping used by all transports and
// adapters.  Previously duplicated across http.ts, hono.ts, fastify.ts, and
// the Next.js package.

/**
 * Map a Surf error code to the appropriate HTTP status code.
 *
 * @param code - A `SurfErrorCode` string (e.g. `'NOT_FOUND'`, `'RATE_LIMITED'`)
 * @returns The corresponding HTTP status number (defaults to 500)
 */
export function getErrorStatus(code: string): number {
  switch (code) {
    case 'UNKNOWN_COMMAND': return 404;
    case 'NOT_FOUND':       return 404;
    case 'INVALID_PARAMS':  return 400;
    case 'AUTH_REQUIRED':   return 401;
    case 'AUTH_FAILED':     return 403;
    case 'SESSION_EXPIRED': return 410;
    case 'RATE_LIMITED':    return 429;
    case 'NOT_SUPPORTED':   return 501;
    default:                return 500;
  }
}
