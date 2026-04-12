import type { CommandDefinition, CommandGroup } from './types.js';

/**
 * Check whether a value looks like a command definition but uses `handler`
 * instead of `run`. Returns true if it should be normalized.
 */
function hasHandlerAlias(value: unknown): value is Record<string, unknown> & { handler: (...args: unknown[]) => unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !('run' in value) &&
    'handler' in value &&
    typeof (value as Record<string, unknown>)['handler'] === 'function'
  );
}

/**
 * Type guard — checks whether a value is a {@link CommandDefinition} (has a `run` function)
 * rather than a nested {@link CommandGroup}. Also accepts `handler` as an alias for `run`.
 *
 * @param value - The value to check.
 * @returns `true` if the value is a command definition.
 *
 * @example
 * ```ts
 * const entry = commands['users.get'];
 * if (isCommandDefinition(entry)) {
 *   // entry is CommandDefinition — has .run(), .description, etc.
 * }
 * ```
 */
export function isCommandDefinition(value: unknown): value is CommandDefinition {
  if (typeof value !== 'object' || value === null) return false;

  // Standard: has `run`
  if ('run' in value && typeof (value as Record<string, unknown>)['run'] === 'function') {
    return true;
  }

  // Alias: has `handler` but no `run` — normalize it
  if (hasHandlerAlias(value)) {
    return true;
  }

  return false;
}

/**
 * Helper for type-safe command grouping.
 *
 * Can be called two ways:
 * - `group(commands)` — identity wrapper for type safety
 * - `group('prefix', commands)` — returns `{ prefix: commands }` for spreading into a config
 *
 * @example
 * ```ts
 * // Spread with prefix:
 * const surf = await createSurf({
 *   commands: {
 *     ...group('cart', {
 *       add: { description: 'Add to cart', run: async (p) => {} },
 *     }),
 *   },
 * });
 * // → command key: 'cart.add'
 * ```
 */
export function group(commands: CommandGroup): CommandGroup;
export function group(prefix: string, commands: CommandGroup): Record<string, CommandGroup>;
export function group(
  prefixOrCommands: string | CommandGroup,
  commands?: CommandGroup,
): CommandGroup | Record<string, CommandGroup> {
  if (typeof prefixOrCommands === 'string') {
    if (!commands) throw new Error('group(prefix, commands) requires a commands object');
    return { [prefixOrCommands]: commands };
  }
  return prefixOrCommands;
}

/**
 * Flatten a potentially nested {@link CommandGroup} into a flat Record with dot-notation keys.
 *
 * Nested groups become dot-separated keys (e.g. `{ users: { get: ... } }` → `{ 'users.get': ... }`).
 * Also normalizes `handler` → `run` aliases and boolean `auth` to string literals.
 *
 * @param commands - The nested command tree to flatten.
 * @returns A flat record mapping dot-notation names to {@link CommandDefinition} objects.
 *
 * @example
 * ```ts
 * const flat = flattenCommands({
 *   users: {
 *     get:  { description: 'Get user', run: async () => ({}) },
 *     list: { description: 'List users', run: async () => ([]) },
 *   },
 * });
 * // → { 'users.get': ..., 'users.list': ... }
 * ```
 */
export function flattenCommands(
  commands: Record<string, CommandDefinition | CommandGroup>,
): Record<string, CommandDefinition> {
  const result: Record<string, CommandDefinition> = {};

  function walk(obj: Record<string, CommandDefinition | CommandGroup>, prefix: string): void {
    for (const [key, value] of Object.entries(obj)) {
      // Skip namespace metadata keys
      if (key === '_description') continue;
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (isCommandDefinition(value)) {
        let cmd = value;

        // Normalize `handler` → `run` alias
        if (!('run' in cmd) && hasHandlerAlias(cmd)) {
          const { handler, ...rest } = cmd as Record<string, unknown> & { handler: (...args: unknown[]) => unknown };
          cmd = { ...rest, run: handler } as unknown as CommandDefinition;
          if (typeof process !== 'undefined' && process.env?.['NODE_ENV'] !== 'test') {
            console.warn(
              `[surf] Command "${fullKey}" uses "handler" instead of "run". ` +
              `This works but "run" is the standard property. Consider renaming it.`
            );
          }
        }

        // Normalize boolean auth to string literals
        if (cmd.auth === true) {
          result[fullKey] = { ...cmd, auth: 'required' };
        } else if (cmd.auth === false) {
          result[fullKey] = { ...cmd, auth: 'none' };
        } else {
          result[fullKey] = cmd;
        }
      } else if (typeof value === 'object' && value !== null) {
        walk(value as Record<string, CommandDefinition | CommandGroup>, fullKey);
      }
    }
  }

  walk(commands, '');
  return result;
}
