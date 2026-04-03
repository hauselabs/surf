import type { SurfMiddleware, MiddlewareContext } from './middleware.js';
import type { CommandDefinition } from './types.js';
import { authRequired, authFailed } from './errors.js';

/**
 * Result returned by an {@link AuthVerifier} function.
 */
export interface AuthResult {
  /** Whether the token is valid. */
  valid: boolean;
  /** Arbitrary claims extracted from the token (e.g. `{ sub: 'user123' }`). */
  claims?: Record<string, unknown>;
  /** Scopes/permissions granted by this token. */
  scopes?: string[];
  /** Human-readable reason when `valid` is `false`. */
  reason?: string;
}

/**
 * Function that verifies an authentication token for a given command.
 *
 * @param token - The bearer token (without the `Bearer ` prefix).
 * @param command - The command name being accessed.
 * @returns An {@link AuthResult} indicating validity, claims, and scopes.
 *
 * @example
 * ```ts
 * const verifier: AuthVerifier = async (token, command) => {
 *   const user = await jwt.verify(token);
 *   return { valid: true, claims: { sub: user.id }, scopes: user.scopes };
 * };
 * ```
 */
export type AuthVerifier = (token: string, command: string) => Promise<AuthResult>;

/**
 * Timing-safe comparison of two strings using Web Crypto API.
 * Both values are hashed to fixed-length SHA-256 digests before comparison,
 * preventing length leakage through timing side-channels.
 * Falls back to a constant-time XOR comparison on padded buffers
 * if crypto.subtle is unavailable.
 */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);

  try {
    // Hash both values to fixed-length digests — no length leakage
    const [hashA, hashB] = await Promise.all([
      crypto.subtle.digest('SHA-256', bufA),
      crypto.subtle.digest('SHA-256', bufB),
    ]);
    const viewA = new Uint8Array(hashA);
    const viewB = new Uint8Array(hashB);
    // Constant-time comparison of the 32-byte digests
    let result = 0;
    for (let i = 0; i < viewA.length; i++) result |= viewA[i]! ^ viewB[i]!;
    return result === 0;
  } catch {
    // Fallback: constant-time comparison on padded buffers
    const maxLen = Math.max(bufA.length, bufB.length, 1);
    let result = bufA.length ^ bufB.length; // length difference contributes to result, not timing
    for (let i = 0; i < maxLen; i++) {
      result |= (bufA[i] ?? 0) ^ (bufB[i] ?? 0);
    }
    return result === 0;
  }
}

/**
 * Compute a short fingerprint (first 16 hex chars of SHA-256) for a token.
 * Used to identify tokens in claims without exposing the raw credential.
 */
async function tokenFingerprint(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  try {
    const hash = await crypto.subtle.digest('SHA-256', data);
    const bytes = new Uint8Array(hash);
    let hex = '';
    for (let i = 0; i < 8; i++) hex += bytes[i]!.toString(16).padStart(2, '0');
    return hex;
  } catch {
    // Fallback: simple hash for environments without crypto.subtle
    let h = 0x811c9dc5;
    for (let i = 0; i < data.length; i++) {
      h ^= data[i]!;
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }
}

/**
 * Create a simple bearer token verifier that checks against a list of valid tokens.
 *
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * @param validTokens - Array of valid bearer tokens.
 * @returns An {@link AuthVerifier} function.
 *
 * @example
 * ```ts
 * const surf = await createSurf({
 *   name: 'my-api',
 *   authVerifier: bearerVerifier([process.env.API_TOKEN!]),
 *   commands: { ... },
 * });
 * ```
 */
export function bearerVerifier(validTokens: string[]): AuthVerifier {
  return async (token: string): Promise<AuthResult> => {
    for (const valid of validTokens) {
      if (await timingSafeEqual(token, valid)) {
        const fingerprint = await tokenFingerprint(token);
        return { valid: true, claims: { sub: 'bearer', tokenId: fingerprint } };
      }
    }
    return { valid: false, reason: 'Invalid token' };
  };
}

/**
 * Check that the token's scopes satisfy the command's requiredScopes.
 * Returns `true` if scopes are sufficient (or not required), `false` if insufficient (sets ctx.error).
 */
function checkScopes(
  command: CommandDefinition,
  result: AuthResult,
  ctx: MiddlewareContext,
): boolean {
  if (command.requiredScopes && command.requiredScopes.length > 0) {
    const tokenScopes = new Set(result.scopes ?? []);
    const missing = command.requiredScopes.filter(s => !tokenScopes.has(s));
    if (missing.length > 0) {
      const err = authFailed(`Missing required scopes: ${missing.join(', ')}`);
      ctx.error = { ok: false, requestId: ctx.context.requestId, error: err.toJSON() };
      return false;
    }
  }
  return true;
}

/**
 * Create a scoped token verifier that maps tokens to their allowed scopes.
 *
 * When used with commands that have `requiredScopes`, the middleware automatically
 * checks that the token's scopes satisfy the command's requirements.
 *
 * @param tokenScopes - Map of token strings to their granted scopes.
 * @returns An {@link AuthVerifier} function.
 *
 * @example
 * ```ts
 * const verifier = scopedVerifier({
 *   'admin-token': ['read', 'write', 'admin'],
 *   'readonly-token': ['read'],
 * });
 * ```
 */
export function scopedVerifier(
  tokenScopes: Record<string, string[]>,
): AuthVerifier {
  return async (token: string): Promise<AuthResult> => {
    const scopes = tokenScopes[token];
    if (scopes !== undefined) {
      const fingerprint = await tokenFingerprint(token);
      return { valid: true, scopes, claims: { sub: 'bearer', tokenId: fingerprint } };
    }
    return { valid: false, reason: 'Invalid token' };
  };
}

/**
 * Create the built-in authentication middleware.
 *
 * This middleware is automatically added when `authVerifier` is set in the Surf config.
 * It checks auth requirements per command (`'none'`, `'required'`, `'optional'`, `'hidden'`)
 * and validates scopes when `requiredScopes` is defined on the command.
 *
 * @param verifier - The {@link AuthVerifier} function to validate tokens.
 * @param getCommand - Lookup function to retrieve command definitions by name.
 * @returns A {@link SurfMiddleware} that enforces authentication.
 */
export function createAuthMiddleware(
  verifier: AuthVerifier,
  getCommand: (name: string) => CommandDefinition | undefined,
): SurfMiddleware {
  return async (ctx: MiddlewareContext, next: () => Promise<void>): Promise<void> => {
    const command = getCommand(ctx.command);
    if (!command) {
      await next();
      return;
    }

    const authLevel = command.auth ?? 'none';

    if (authLevel === 'none') {
      await next();
      return;
    }

    const token = ctx.context.auth;

    if (authLevel === 'required' || authLevel === 'hidden') {
      if (!token) {
        const err = authRequired(ctx.command);
        ctx.error = { ok: false, requestId: ctx.context.requestId, error: err.toJSON() };
        return;
      }
      let result: AuthResult;
      try {
        result = await verifier(token, ctx.command);
      } catch {
        const err = authFailed('Authentication verification failed');
        ctx.error = { ok: false, requestId: ctx.context.requestId, error: err.toJSON() };
        return;
      }
      if (!result.valid) {
        const err = authFailed(result.reason);
        ctx.error = { ok: false, requestId: ctx.context.requestId, error: err.toJSON() };
        return;
      }
      if (!checkScopes(command, result, ctx)) return;
      ctx.context = { ...ctx.context, claims: result.claims, scopes: result.scopes };
      await next();
      return;
    }

    if (authLevel === 'optional') {
      if (token) {
        let result: AuthResult;
        try {
          result = await verifier(token, ctx.command);
        } catch {
          const err = authFailed('Authentication verification failed');
          ctx.error = { ok: false, requestId: ctx.context.requestId, error: err.toJSON() };
          return;
        }
        if (!result.valid) {
          const err = authFailed(result.reason);
          ctx.error = { ok: false, requestId: ctx.context.requestId, error: err.toJSON() };
          return;
        }
        if (!checkScopes(command, result, ctx)) return;
        ctx.context = { ...ctx.context, claims: result.claims, scopes: result.scopes };
      }
      await next();
      return;
    }

    await next();
  };
}
