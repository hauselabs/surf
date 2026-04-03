import { createContext } from 'react';

/**
 * Connection status for the Surf WebSocket.
 *
 * - `'connecting'` — Initial connection in progress
 * - `'connected'` — WebSocket is open and ready
 * - `'disconnected'` — No active connection
 * - `'reconnecting'` — Auto-reconnecting after a drop
 */
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

/**
 * Callback function type for Surf event subscriptions.
 *
 * @param data - The event payload, shape depends on the event type
 */
export type EventCallback = (data: unknown) => void;

/**
 * The value provided by {@link SurfProvider} via React context.
 *
 * Access it with the {@link useSurf} hook.
 *
 * @example
 * ```tsx
 * const { execute, status, connected } = useSurf();
 *
 * const result = await execute('search', { query: 'hello' });
 * console.log(status); // 'connected'
 * ```
 */
export interface SurfContextValue {
  /**
   * Execute a command on the Surf server via WebSocket.
   *
   * @param command - The command name to execute
   * @param params - Optional parameters for the command
   * @returns A promise resolving to the command result
   * @throws Error if the WebSocket is not connected
   */
  execute: (command: string, params?: Record<string, unknown>) => Promise<SurfResult>;
  /** Current WebSocket connection status. */
  status: ConnectionStatus;
  /** Whether the WebSocket is currently connected and ready. */
  connected: boolean;
  /** Current session ID, if a session has been established. */
  sessionId: string | undefined;
  /**
   * Subscribe to a Surf event. Returns an unsubscribe function.
   *
   * @param event - Event name to listen for (e.g. `'surf:state'`, `'timeline.updated'`)
   * @param callback - Called when the event fires
   * @returns A cleanup function that removes the subscription
   */
  subscribe: (event: string, callback: EventCallback) => () => void;
  /**
   * Subscribe to a Surf Live channel for real-time updates.
   *
   * @param channelId - The channel identifier to subscribe to
   */
  subscribeChannel: (channelId: string) => void;
  /**
   * Unsubscribe from a Surf Live channel.
   *
   * @param channelId - The channel identifier to unsubscribe from
   */
  unsubscribeChannel: (channelId: string) => void;
  /** Set of currently subscribed channel IDs. */
  channels: ReadonlySet<string>;
}

/**
 * Result returned from executing a Surf command.
 *
 * @example
 * ```ts
 * const result: SurfResult = await execute('search', { query: 'test' });
 * if (result.ok) {
 *   console.log(result.result);
 * } else {
 *   console.error(result.error?.message);
 * }
 * ```
 */
export interface SurfResult {
  /** Whether the command executed successfully. */
  ok: boolean;
  /** The command's return value (present when `ok` is `true`). */
  result?: unknown;
  /** Error details (present when `ok` is `false`). */
  error?: { code: string; message: string };
  /** Updated session state, if the command modified it. */
  state?: Record<string, unknown>;
}

/**
 * React context for Surf. Use {@link SurfProvider} to provide a value
 * and {@link useSurf} to consume it.
 *
 * @internal
 */
export const SurfContext = createContext<SurfContextValue | null>(null);
