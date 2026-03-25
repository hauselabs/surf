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
 * Falls back to simple comparison if crypto.subtle is unavailable.
 */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  if (a.length !== b.length) return false;
  try {
    const encoder = new TextEncoder();
    const bufA = encoder.encode(a);
    const bufB = encoder.encode(b);
    // Import as HMAC key and sign to get constant-time comparison
    const key = await crypto.subtle.importKey(
      'raw', bufA, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, bufB));
    const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, bufA));
    if (sig.length !== expected.length) return false;
    let result = 0;
    for (let i = 0; i < sig.length; i++) result |= sig[i]! ^ expected[i]!;
    return result === 0;
  } catch {
    // Fallback for environments without crypto.subtle
    return a === b;
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
