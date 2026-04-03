import type {
  PipelineRequest,
  PipelineResponse,
  PipelineStepResult,
  ExecutionContext,
} from '../types.js';
import type { CommandRegistry } from '../commands.js';
import type { InMemorySessionStore } from '../session.js';

/**
 * Resolve `$alias` references in parameter values.
 */
function resolveValue(value: unknown, aliases: Map<string, unknown>): unknown {
  if (typeof value === 'string' && value.startsWith('$')) {
    return resolveAlias(value, aliases);
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveValue(item, aliases));
  }
  if (typeof value === 'object' && value !== null) {
    return resolveParams(value as Record<string, unknown>, aliases);
  }
  return value;
}

function resolveParams(
  params: Record<string, unknown>,
  aliases: Map<string, unknown>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    resolved[key] = resolveValue(value, aliases);
  }

  return resolved;
}

function resolveAlias(ref: string, aliases: Map<string, unknown>): unknown {
  const path = ref.slice(1);
  const dotIndex = path.indexOf('.');
  const bracketIndex = path.indexOf('[');

  let aliasName: string;
  let propertyPath: string | undefined;

  if (dotIndex === -1 && bracketIndex === -1) {
    aliasName = path;
  } else if (dotIndex === -1) {
    aliasName = path.slice(0, bracketIndex);
    propertyPath = path.slice(bracketIndex);
  } else if (bracketIndex === -1) {
    aliasName = path.slice(0, dotIndex);
    propertyPath = path.slice(dotIndex + 1);
  } else {
    const firstSep = Math.min(dotIndex, bracketIndex);
    aliasName = path.slice(0, firstSep);
    propertyPath = path.slice(firstSep === dotIndex ? firstSep + 1 : firstSep);
  }

  const aliasValue = aliases.get(aliasName);
  if (propertyPath === undefined) {
    return aliasValue;
  }

  return getNestedValue(aliasValue, propertyPath);
}

function getNestedValue(obj: unknown, path: string): unknown {
  const normalized = path.replace(/\[(\d+)\]/g, '.$1');
  const parts = normalized.split('.').filter(Boolean);

  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Execute a pipeline of commands sequentially.
 */
export async function executePipeline(
  request: PipelineRequest,
  registry: CommandRegistry,
  sessions: InMemorySessionStore,
  auth?: string,
): Promise<PipelineResponse> {
  const { steps, sessionId, continueOnError = false } = request;
  const results: PipelineStepResult[] = [];
  const aliases = new Map<string, unknown>();

  let sessionState: Record<string, unknown> | undefined;
  if (sessionId) {
    const session = await sessions.get(sessionId);
    if (session) {
      sessionState = session.state;
    }
  }

  for (const step of steps) {
    const resolvedParams = step.params
      ? resolveParams(step.params, aliases)
      : undefined;

    const context: ExecutionContext = {
      sessionId,
      auth,
      state: sessionState,
    };

    const response = await registry.execute(step.command, resolvedParams, context);

    if (response.ok) {
      results.push({
        command: step.command,
        ok: true,
        result: response.result,
      });

      if (step.as) {
        aliases.set(step.as, response.result);
      }

      if (sessionId && response.state) {
        sessionState = response.state;
        await sessions.update(sessionId, response.state);
      }
    } else {
      results.push({
        command: step.command,
        ok: false,
        error: {
          code: response.error.code,
          message: response.error.message,
        },
      });

      if (!continueOnError) {
        return { ok: false, results };
      }
    }
  }

  const allOk = results.every((r) => r.ok);
  return { ok: allOk, results };
}
