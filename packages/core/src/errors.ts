import type { SurfErrorCode } from './types.js';

/**
 * Base error class for all Surf errors.
 *
 * Carries a machine-readable error code alongside the human-readable message.
 * Automatically maps to the correct HTTP status code via {@link getErrorStatus}.
 *
 * @example
 * ```ts
 * import { SurfError } from '@surfjs/core';
 *
 * throw new SurfError('NOT_FOUND', 'User not found', { userId: '123' });
 * // → { code: 'NOT_FOUND', message: 'User not found', details: { userId: '123' } }
 * ```
 */
export class SurfError extends Error {
  /** Machine-readable error code (e.g. `'NOT_FOUND'`, `'INVALID_PARAMS'`). */
  readonly code: SurfErrorCode;
  /** Optional structured details about the error. */
  readonly details?: Record<string, unknown>;

  /**
   * @param code - A {@link SurfErrorCode} identifying the error type.
   * @param message - Human-readable error message.
   * @param details - Optional structured details (e.g. field names, resource IDs).
   */
  constructor(code: SurfErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'SurfError';
    this.code = code;
    this.details = details;
  }

  /**
   * Serialize to a plain JSON object for API responses.
   *
   * @returns A plain object with `code`, `message`, and optional `details`.
   */
  toJSON(): { code: SurfErrorCode; message: string; details?: Record<string, unknown> } {
    return {
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

// ─── Convenience constructors ───────────────────────────────────────────────

/**
 * Create a `UNKNOWN_COMMAND` error for when a requested command doesn't exist.
 *
 * @param command - The command name that was not found.
 * @returns A {@link SurfError} with code `UNKNOWN_COMMAND` (HTTP 404).
 */
export function unknownCommand(command: string): SurfError {
  return new SurfError('UNKNOWN_COMMAND', `Unknown command: ${command}`, { command });
}

/**
 * Create a `NOT_FOUND` error for when a resource doesn't exist.
 *
 * @param resource - The type of resource (e.g. `'user'`, `'product'`).
 * @param id - Optional identifier of the missing resource.
 * @returns A {@link SurfError} with code `NOT_FOUND` (HTTP 404).
 *
 * @example
 * ```ts
 * throw notFound('user', '123');
 * // → { code: 'NOT_FOUND', message: 'user not found: 123' }
 * ```
 */
export function notFound(resource: string, id?: string): SurfError {
  return new SurfError('NOT_FOUND', id ? `${resource} not found: ${id}` : `${resource} not found`, { resource, ...(id ? { id } : {}) });
}

/**
 * Create an `INVALID_PARAMS` error for validation failures.
 *
 * @param message - Description of what's wrong with the parameters.
 * @param details - Optional structured details (e.g. `{ errors: ['field X required'] }`).
 * @returns A {@link SurfError} with code `INVALID_PARAMS` (HTTP 400).
 */
export function invalidParams(message: string, details?: Record<string, unknown>): SurfError {
  return new SurfError('INVALID_PARAMS', message, details);
}

/**
 * Create an `AUTH_REQUIRED` error when authentication is missing.
 *
 * @param command - Optional command name that required auth.
 * @returns A {@link SurfError} with code `AUTH_REQUIRED` (HTTP 401).
 */
export function authRequired(command?: string): SurfError {
  return new SurfError(
    'AUTH_REQUIRED',
    command ? `Authentication required for command: ${command}` : 'Authentication required',
  );
}

/**
 * Create an `AUTH_FAILED` error when authentication credentials are invalid.
 *
 * @param reason - Optional reason for the failure.
 * @returns A {@link SurfError} with code `AUTH_FAILED` (HTTP 403).
 */
export function authFailed(reason?: string): SurfError {
  return new SurfError('AUTH_FAILED', reason ?? 'Authentication failed');
}

/**
 * Create a `SESSION_EXPIRED` error when a session is no longer valid.
 *
 * @param _sessionId - Optional session ID (not included in error message for security).
 * @returns A {@link SurfError} with code `SESSION_EXPIRED` (HTTP 410).
 */
export function sessionExpired(_sessionId?: string): SurfError {
  return new SurfError('SESSION_EXPIRED', 'Session expired or not found');
}

/**
 * Create a `RATE_LIMITED` error when too many requests have been made.
 *
 * @param retryAfterMs - Optional milliseconds until the client can retry.
 * @returns A {@link SurfError} with code `RATE_LIMITED` (HTTP 429).
 */
export function rateLimited(retryAfterMs?: number): SurfError {
  return new SurfError('RATE_LIMITED', 'Too many requests', retryAfterMs ? { retryAfterMs } : undefined);
}

/**
 * Create an `INTERNAL_ERROR` error for unexpected server-side failures.
 *
 * @param message - Optional error message (sanitized in production, detailed in debug mode).
 * @returns A {@link SurfError} with code `INTERNAL_ERROR` (HTTP 500).
 */
export function internalError(message?: string): SurfError {
  return new SurfError('INTERNAL_ERROR', message ?? 'Internal server error');
}

/**
 * Create a `NOT_SUPPORTED` error when a command is unavailable in the current context.
 *
 * @param command - The command name that is not supported.
 * @returns A {@link SurfError} with code `NOT_SUPPORTED` (HTTP 501).
 */
export function notSupported(command: string): SurfError {
  return new SurfError('NOT_SUPPORTED', `Command not available: ${command}`, { command });
}

// ─── Guard rails ────────────────────────────────────────────────────────────

/**
 * Throws a clear error if the given value looks like a Promise (i.e. has a `.then` method).
 * This catches the common mistake of forgetting to `await createSurf()`.
 */
export function assertNotPromise(surf: unknown): void {
  if (surf && typeof (surf as { then?: unknown }).then === 'function') {
    throw new Error(
      'Did you forget to await createSurf()? Received a Promise instead of a SurfInstance.',
    );
  }
}
