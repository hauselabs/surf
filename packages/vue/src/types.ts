import type { Ref, ComputedRef } from 'vue';

/** Connection status for the Surf WebSocket. */
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

/** Event callback function type. */
export type EventCallback = (data: unknown) => void;

/** The shape of the Surf context value. */
export interface SurfContextValue {
  /** Execute a command on the Surf server. */
  execute: (command: string, params?: Record<string, unknown>) => Promise<SurfResult>;
  /** Current connection status. */
  status: Ref<ConnectionStatus>;
  /** Whether the WebSocket is connected. */
  connected: ComputedRef<boolean>;
  /** Current session ID, if a session is active. */
  sessionId: Ref<string | undefined>;
  /** Subscribe to a Surf event. Returns unsubscribe function. */
  subscribe: (event: string, callback: EventCallback) => () => void;
  /** Subscribe to a channel. */
  subscribeChannel: (channelId: string) => void;
  /** Unsubscribe from a channel. */
  unsubscribeChannel: (channelId: string) => void;
  /** Currently subscribed channels. */
  channels: Ref<ReadonlySet<string>>;
}

/** Result from executing a Surf command. */
export interface SurfResult {
  ok: boolean;
  result?: unknown;
  error?: { code: string; message: string };
  state?: Record<string, unknown>;
}
