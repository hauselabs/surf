import { onDestroy } from 'svelte';
import { registerCommand } from '@surfjs/web';
import type { CommandConfig } from '@surfjs/web';

/** Configuration for a single command handler. */
export type SurfCommandConfig = CommandConfig;

/** Map of command names to their configurations. */
export type SurfCommandsMap = Record<string, SurfCommandConfig>;

/**
 * Register local command handlers with `window.surf`.
 *
 * Handlers run IN the browser, modifying local state directly.
 * No server roundtrip for `mode: 'local'` commands.
 * For `mode: 'sync'`, the handler runs locally AND the command is
 * also POSTed to the server in the background for persistence.
 *
 * Works with or without SurfProvider — registers directly with `window.surf`
 * via `@surfjs/web`.
 *
 * Call this in your component's `<script>` block (Svelte 4) or at the top level
 * of a `<script>` with runes (Svelte 5). Handlers are registered immediately
 * and cleaned up when the component is destroyed.
 *
 * @example
 * ```svelte
 * <script>
 *   import { surfCommands } from '@surfjs/svelte'
 *
 *   surfCommands({
 *     'canvas.addCircle': {
 *       mode: 'local',
 *       run: (params) => {
 *         addCircleToCanvas(params)
 *         return { ok: true }
 *       }
 *     }
 *   })
 * </script>
 * ```
 */
export function surfCommands(commands: SurfCommandsMap): void {
  const cleanups = Object.entries(commands).map(
    ([name, config]) => registerCommand(name, config),
  );

  onDestroy(() => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  });
}
