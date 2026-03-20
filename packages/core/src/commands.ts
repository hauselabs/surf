import type { CommandDefinition, CommandGroup, ExecutionContext, SurfResponse, RateLimitConfig } from './types.js';
import type { SurfMiddleware, MiddlewareContext } from './middleware.js';
import { runMiddlewarePipeline } from './middleware.js';
import { SurfError, unknownCommand, authRequired, internalError } from './errors.js';
import { validateParams, validateResult } from './validation.js';
import { flattenCommands } from './namespace.js';
import { RateLimiter } from './ratelimit.js';

export interface CommandRegistryOptions {
  validateReturns?: boolean;
  globalRateLimit?: RateLimitConfig;
}

/**
 * Command registry — stores, validates, and executes commands.
 */
export class CommandRegistry {
  private readonly commands: ReadonlyMap<string, CommandDefinition>;
  private middlewares: readonly SurfMiddleware[] = [];
  private readonly options: CommandRegistryOptions;
  private readonly rateLimiter: RateLimiter;

  constructor(
    commands: Record<string, CommandDefinition | CommandGroup>,
    options: CommandRegistryOptions = {},
  ) {
    const flat = flattenCommands(commands);
    this.commands = new Map(Object.entries(flat));
    this.options = options;
    this.rateLimiter = new RateLimiter();
  }

  setMiddleware(middlewares: SurfMiddleware[]): void {
    this.middlewares = [...middlewares];
  }

  has(name: string): boolean {
    return this.commands.has(name);
  }

  get(name: string): CommandDefinition | undefined {
    return this.commands.get(name);
  }

  list(): ReadonlyMap<string, CommandDefinition> {
    return this.commands;
  }

  async execute(
    name: string,
    params: Record<string, unknown> | undefined,
    context: ExecutionContext,
  ): Promise<SurfResponse> {
    if (this.middlewares.length === 0) {
      return this.executeInner(name, params, context);
    }

    const ctx: MiddlewareContext = {
      command: name,
      params: params ?? {},
      context: { ...context },
      result: undefined,
      error: undefined,
    };

    await runMiddlewarePipeline(this.middlewares, ctx, async () => {
      const response = await this.executeInner(name, ctx.params, ctx.context);
      if (response.ok) {
        ctx.result = response;
      } else {
        ctx.error = response;
      }
    });

    if (ctx.error) return ctx.error;
    if (ctx.result) return ctx.result;
    return this.executeInner(name, ctx.params, ctx.context);
  }

  private async executeInner(
    name: string,
    params: Record<string, unknown> | undefined,
    context: ExecutionContext,
  ): Promise<SurfResponse> {
    const command = this.commands.get(name);

    if (!command) {
      const err = unknownCommand(name);
      return { ok: false, requestId: context.requestId, error: err.toJSON() };
    }

    // Rate limiting — check per-command limit first, then global
    const rateCfg = command.rateLimit ?? this.options.globalRateLimit;
    if (rateCfg) {
      try {
        const key = RateLimiter.buildKey(name, rateCfg, context);
        this.rateLimiter.check(rateCfg, key);
      } catch (e) {
        if (e instanceof SurfError) {
          return { ok: false, requestId: context.requestId, error: e.toJSON() };
        }
        throw e;
      }
    }

    if (command.auth === 'required' && !context.auth && !context.claims) {
      const err = authRequired(name);
      return { ok: false, requestId: context.requestId, error: err.toJSON() };
    }

    let validatedParams: Record<string, unknown>;
    try {
      validatedParams = command.params
        ? validateParams(params, command.params)
        : (params ?? {});
    } catch (e) {
      if (e instanceof SurfError) {
        return { ok: false, requestId: context.requestId, error: e.toJSON() };
      }
      throw e;
    }

    try {
      const result = await command.run(validatedParams, context);

      // Return schema validation
      if (this.options.validateReturns && command.returns && !('$ref' in command.returns)) {
        try {
          validateResult(result, command.returns, name);
        } catch (e) {
          if (e instanceof SurfError) {
            return { ok: false, requestId: context.requestId, error: e.toJSON() };
          }
          throw e;
        }
      }

      return {
        ok: true,
        requestId: context.requestId,
        result,
        ...(context.sessionId ? { sessionId: context.sessionId } : {}),
        ...(context.state ? { state: context.state } : {}),
      };
    } catch (e) {
      if (e instanceof SurfError) {
        return { ok: false, requestId: context.requestId, error: e.toJSON() };
      }
      const err = internalError(e instanceof Error ? e.message : 'Unknown error');
      return { ok: false, requestId: context.requestId, error: err.toJSON() };
    }
  }
}
