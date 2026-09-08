import { create } from 'zustand';
import {
  type ConnectionState,
  type RealtimeConnectionInfo,
} from '@/services/websocket/connection-state';

interface ConnectionStore extends RealtimeConnectionInfo {
  setState: (state: ConnectionState) => void;
  recordMessage: (at: number) => void;
  recordLatency: (latencyMs: number) => void;
  setReconnectAttempt: (attempt: number) => void;
}

/**
 * Realtime connection status for the header indicator. In phase 1 the
 * gateway does not exist yet, so the store rests in `unavailable`.
 */
export const useConnectionStore = create<ConnectionStore>((set) => ({
  state: 'unavailable',
  lastMessageAt: null,
  latencyMs: null,
  reconnectAttempt: 0,
  setState: (state) => set({ state }),
  recordMessage: (at) => set({ lastMessageAt: at }),
  recordLatency: (latencyMs) => set({ latencyMs }),
  setReconnectAttempt: (attempt) => set({ reconnectAttempt: attempt }),
}));
