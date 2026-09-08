/**
 * Realtime connection lifecycle states shared by the (future) WebSocket
 * client and the UI indicator. Phase 1 only renders the indicator; the
 * gateway client that drives these transitions arrives with the market data
 * gateway.
 */
export const CONNECTION_STATES = [
  'idle',
  'connecting',
  'connected',
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
}
