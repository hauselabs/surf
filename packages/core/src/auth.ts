import type { SurfMiddleware, MiddlewareContext } from './middleware.js';
import type { CommandDefinition } from './types.js';
import { authRequired, authFailed } from './errors.js';

export interface AuthResult {
  valid: boolean;
  claims?: Record<string, unknown>;
  reason?: string;
}

export type AuthVerifier = (token: string, command: string) => Promise<AuthResult>;

export function bearerVerifier(validTokens: string[]): AuthVerifier {
  const tokenSet = new Set(validTokens);
  return async (token: string): Promise<AuthResult> => {
    if (tokenSet.has(token)) {
      return { valid: true, claims: { token } };
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

    if (authLevel === 'required') {
      if (!token) {
        const err = authRequired(ctx.command);
        ctx.error = { ok: false, requestId: ctx.context.requestId, error: err.toJSON() };
        return;
      }
      const result = await verifier(token, ctx.command);
      if (!result.valid) {
        const err = authFailed(result.reason);
        ctx.error = { ok: false, requestId: ctx.context.requestId, error: err.toJSON() };
        return;
      }
      ctx.context = { ...ctx.context, claims: result.claims };
      await next();
      return;
    }

    if (authLevel === 'optional') {
      if (token) {
        const result = await verifier(token, ctx.command);
        if (!result.valid) {
          const err = authFailed(result.reason);
          ctx.error = { ok: false, requestId: ctx.context.requestId, error: err.toJSON() };
          return;
        }
        ctx.context = { ...ctx.context, claims: result.claims };
      }
      await next();
      return;
    }

    await next();
  };
}
