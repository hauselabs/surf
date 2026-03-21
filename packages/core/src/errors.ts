import type { SurfErrorCode } from './types.js';

/**
 * Base error class for all Surf errors.
 * Carries a machine-readable code alongside the human message.
 */
export class SurfError extends Error {
  readonly code: SurfErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: SurfErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'SurfError';
    this.code = code;
    this.details = details;
  }

  toJSON(): { code: SurfErrorCode; message: string; details?: Record<string, unknown> } {
    return {
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

// ─── Convenience constructors ───────────────────────────────────────────────

export function unknownCommand(command: string): SurfError {
  return new SurfError('UNKNOWN_COMMAND', `Unknown command: ${command}`, { command });
}

export function notFound(resource: string, id?: string): SurfError {
  return new SurfError('NOT_FOUND', id ? `${resource} not found: ${id}` : `${resource} not found`, { resource, ...(id ? { id } : {}) });
}

export function invalidParams(message: string, details?: Record<string, unknown>): SurfError {
  return new SurfError('INVALID_PARAMS', message, details);
}

export function authRequired(command?: string): SurfError {
  return new SurfError(
    'AUTH_REQUIRED',
    command ? `Authentication required for command: ${command}` : 'Authentication required',
  );
}

export function authFailed(reason?: string): SurfError {
  return new SurfError('AUTH_FAILED', reason ?? 'Authentication failed');
}

export function sessionExpired(sessionId: string): SurfError {
  return new SurfError('SESSION_EXPIRED', `Session expired: ${sessionId}`, { sessionId });
}

export function rateLimited(retryAfterMs?: number): SurfError {
  return new SurfError('RATE_LIMITED', 'Too many requests', retryAfterMs ? { retryAfterMs } : undefined);
}

export function internalError(message?: string): SurfError {
  return new SurfError('INTERNAL_ERROR', message ?? 'Internal server error');
}

export function notSupported(command: string): SurfError {
  return new SurfError('NOT_SUPPORTED', `Command not available: ${command}`, { command });
}
