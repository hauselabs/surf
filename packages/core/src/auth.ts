import type { SurfMiddleware, MiddlewareContext } from './middleware.js';
import type { CommandDefinition } from './types.js';
import { authRequired, authFailed } from './errors.js';

export interface AuthResult {
  valid: boolean;
  claims?: Record<string, unknown>;
  scopes?: string[];
  reason?: string;
}

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

export function bearerVerifier(validTokens: string[]): AuthVerifier {
  return async (token: string): Promise<AuthResult> => {
    for (const valid of validTokens) {
      if (await timingSafeEqual(token, valid)) {
        return { valid: true, claims: { token } };
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

export function scopedVerifier(
  tokenScopes: Record<string, string[]>,
): AuthVerifier {
  return async (token: string): Promise<AuthResult> => {
    const scopes = tokenScopes[token];
    if (scopes !== undefined) {
      return { valid: true, scopes, claims: { token } };
    }
    return { valid: false, reason: 'Invalid token' };
  };
}

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
