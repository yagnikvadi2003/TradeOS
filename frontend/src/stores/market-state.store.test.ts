import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { type MarketUpdate } from '@/services/websocket/market-stream.messages';
import { MockMarketStream } from '@/services/websocket/mock-market-stream';
import {
  useLiveIndexTick,
  useLiveNewestTimestamp,
  useMarketStateStore,
} from './market-state.store';

const tick = (key: string, ltp: number, ts: number): MarketUpdate => ({
  kind: 'index',
  instrumentKey: key as never,
  timestamp: ts,
  receivedAt: ts,
  ltp,
  previousClose: 1,
  open: null,
  high: null,
  low: null,
  change: null,
  changePercent: null,
  volume: null,
  source: 'simulated',
});

describe('market-state store', () => {
  beforeEach(() => useMarketStateStore.getState().reset());

  it('applies batches immutably, ignores stale ticks and keeps untouched entries by reference', () => {
    const { applyBatch } = useMarketStateStore.getState();
    applyBatch([tick('A', 1, 10), tick('B', 1, 10)]);
    const b = useMarketStateStore.getState().updates.B;
    applyBatch([tick('A', 2, 11), tick('A', 0, 9)]);
    const s = useMarketStateStore.getState();
    expect(s.updates.A?.ltp).toBe(2);
    expect(s.updates.B).toBe(b);
    expect(s.version).toBe(2);
    expect(s.lastUpdateAt).toBe(11);
    applyBatch([tick('A', 5, 5)]); // all stale → no version bump
    expect(useMarketStateStore.getState().version).toBe(2);
  });

  it('selectors re-render only for their key', () => {
    const { applyBatch } = useMarketStateStore.getState();
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useLiveIndexTick('A');
    });
    act(() => applyBatch([tick('B', 1, 1)]));
    expect(result.current).toBeNull();
    const after = renders;
    act(() => applyBatch([tick('A', 7, 2)]));
    expect(result.current?.ltp).toBe(7);
    expect(renders).toBe(after + 1);
    const newest = renderHook(() => useLiveNewestTimestamp(['A', 'B']));
    expect(newest.result.current).toBe(2);
  });

  it('is fed by the mock stream with simulated, catalog-only updates', async () => {
    const stream = new MockMarketStream({ manual: true, now: () => Date.UTC(2026, 8, 8, 5, 30) });
    const seen: MarketUpdate[] = [];
    stream.onUpdates((u) => seen.push(...u));
    const release = stream.subscribe([
      'NSE:INDEX:NIFTY50',
      'NSE:OPT:NIFTY50:2026-09-15:24000:CE',
      'NSE:INDEX:NOPE',
    ]);
    await Promise.resolve();
    expect(stream.info.state).toBe('connected');
    expect(seen.map((u) => u.kind).sort()).toEqual(['index', 'option']);
    expect(seen.every((u) => u.source === 'simulated')).toBe(true);
    release();
    expect(stream.info.state).toBe('idle');
  });
});
