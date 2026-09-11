/**
 * Realtime connection lifecycle states shared by the market-stream client
 * and the UI indicator. `degraded` means the socket is open but the
 * upstream provider feed is stale or reconnecting.
 */
export const CONNECTION_STATES = [
  'idle',
  'connecting',
  'connected',
  'degraded',
  'reconnecting',
  'disconnected',
  'unavailable',
] as const;

export type ConnectionState = (typeof CONNECTION_STATES)[number];

export interface RealtimeConnectionInfo {
  readonly state: ConnectionState;
  /** Epoch ms of the last message received from the gateway, if any. */
  readonly lastMessageAt: number | null;
  /** Round-trip latency of the last heartbeat, ms. */
  readonly latencyMs: number | null;
  readonly reconnectAttempt: number;
  /** Upstream provider feed state as reported by the gateway. */
  readonly providerState: ProviderConnectionState | null;
  readonly providerStale: boolean;
}

export type ProviderConnectionState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'AUTHENTICATING'
  | 'CONNECTED'
  | 'DEGRADED'
  | 'RECONNECTING'
  | 'STOPPING';
