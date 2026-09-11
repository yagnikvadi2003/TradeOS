import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import {
  type IndexTick,
  type MarketUpdate,
  type OptionTick,
  type StreamKey,
  streamKeyOf,
} from '@/services/websocket/market-stream.messages';

interface MarketStateStore {
  /** Latest update per stream key. Replaced immutably per batch, entries stable when unchanged. */
  readonly updates: Readonly<Record<StreamKey, MarketUpdate>>;
  /** Monotonic batch counter — cheap change signal for non-React subscribers. */
  readonly version: number;
  /** Epoch ms of the newest update applied. */
  readonly lastUpdateAt: number | null;
  /** Keys changed by the last applied batch — lets non-React consumers patch only those rows. */
  readonly lastBatchKeys: readonly StreamKey[];
  applyBatch: (batch: readonly MarketUpdate[]) => void;
  drop: (keys: readonly StreamKey[]) => void;
  reset: () => void;
}

/**
 * Live market state for the UI. One `set` per delta frame (the gateway
 * already coalesces to one frame per ~100 ms per client), and an entry only
 * changes reference when its data changed, so selector-based subscribers
 * re-render for their own key alone. Out-of-order ticks never regress state.
 */
export const useMarketStateStore = create<MarketStateStore>((set) => ({
  updates: {},
  version: 0,
  lastUpdateAt: null,
  lastBatchKeys: [],
  applyBatch: (batch) =>
    set((s) => {
      let next: Record<StreamKey, MarketUpdate> | null = null;
      let latest = s.lastUpdateAt;
      const changed: StreamKey[] = [];
      for (const update of batch) {
        const key = streamKeyOf(update);
        const existing = s.updates[key];
        if (existing && existing.timestamp > update.timestamp) continue;
        next ??= { ...s.updates };
        next[key] = update;
        changed.push(key);
        if (latest === null || update.timestamp > latest) latest = update.timestamp;
      }
      if (!next) return s;
      return {
        updates: next,
        version: s.version + 1,
        lastUpdateAt: latest,
        lastBatchKeys: changed,
      };
    }),
  drop: (keys) =>
    set((s) => {
      if (!keys.some((k) => k in s.updates)) return s;
      const next = { ...s.updates };
      for (const key of keys) delete next[key];
      return { updates: next, version: s.version + 1, lastBatchKeys: [] };
    }),
  reset: () => set({ updates: {}, version: 0, lastUpdateAt: null, lastBatchKeys: [] }),
}));

/** Latest index tick for a key; re-renders only when that entry changes. */
export function useLiveIndexTick(key: StreamKey): IndexTick | null {
  return useMarketStateStore((s) => {
    const u = s.updates[key];
    return u?.kind === 'index' ? u : null;
  });
}

export function useLiveOptionTick(key: StreamKey): OptionTick | null {
  return useMarketStateStore((s) => {
    const u = s.updates[key];
    return u?.kind === 'option' ? u : null;
  });
}

/** Newest timestamp across a set of keys (for freshness) without subscribing to the data itself. */
export function useLiveNewestTimestamp(keys: readonly StreamKey[]): number | null {
  return useMarketStateStore(
    useShallow((s) => {
      let newest: number | null = null;
      for (const key of keys) {
        const u = s.updates[key];
        if (u && (newest === null || u.timestamp > newest)) newest = u.timestamp;
      }
      return newest;
    }),
  );
}
