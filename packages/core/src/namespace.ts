import type { CommandDefinition, CommandGroup } from './types.js';

/**
 * Type guard — checks whether a value is a CommandDefinition (has a `run` function)
 * rather than a nested CommandGroup.
 */
export function isCommandDefinition(value: unknown): value is CommandDefinition {
  return (
    typeof value === 'object' &&
    value !== null &&
    'run' in value &&
    typeof (value as Record<string, unknown>)['run'] === 'function'
  );
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
 * const surf = createSurf({
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
 * Flatten a potentially nested CommandGroup into a flat Record with dot-notation keys.
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
        // Normalize boolean auth to string literals
        if (value.auth === true) {
          result[fullKey] = { ...value, auth: 'required' };
        } else if (value.auth === false) {
          result[fullKey] = { ...value, auth: 'none' };
        } else {
          result[fullKey] = value;
        }
      } else if (typeof value === 'object' && value !== null) {
        walk(value as Record<string, CommandDefinition | CommandGroup>, fullKey);
      }
    }
  }

  walk(commands, '');
  return result;
}
