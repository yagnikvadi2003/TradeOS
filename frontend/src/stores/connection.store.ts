import { create } from 'zustand';
import {
  type ConnectionState,
  type ProviderConnectionState,
  type RealtimeConnectionInfo,
} from '@/services/websocket/connection-state';

interface ConnectionStore extends RealtimeConnectionInfo {
  setState: (state: ConnectionState) => void;
  recordMessage: (at: number) => void;
  recordLatency: (latencyMs: number) => void;
  setReconnectAttempt: (attempt: number) => void;
  setProvider: (state: ProviderConnectionState, stale: boolean) => void;
}

/**
 * Realtime connection status for the header indicator. Updated by the
 * market-stream client on state changes only — never per tick.
 */
export const useConnectionStore = create<ConnectionStore>((set) => ({
  state: 'unavailable',
  lastMessageAt: null,
  latencyMs: null,
  reconnectAttempt: 0,
  providerState: null,
  providerStale: false,
  setState: (state) => set((s) => (s.state === state ? s : { state })),
  setProvider: (providerState, providerStale) =>
    set((s) =>
      s.providerState === providerState && s.providerStale === providerStale
        ? s
        : { providerState, providerStale },
    ),
  recordMessage: (at) => set({ lastMessageAt: at }),
  recordLatency: (latencyMs) => set({ latencyMs }),
  setReconnectAttempt: (attempt) => set({ reconnectAttempt: attempt }),
}));
