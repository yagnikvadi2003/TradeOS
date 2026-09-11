import { describe, expect, it } from 'vitest';
import { simulateExpiries, simulateSnapshot } from '@/services/api/option-chain.simulator';
import { simulateUpdate } from '@/services/websocket/mock-market-stream';
import {
  type IndexTick,
  type MarketUpdate,
  type OptionTick,
} from '@/services/websocket/market-stream.messages';
import { contractKeysOf, mergeRowsLive, mergeUnderlyingLive } from './live-merge';
import { snapshotToRows } from './rows';

const NOW = Date.UTC(2026, 8, 8, 5, 30);
const KEY = 'NSE:INDEX:NIFTY50' as const;

describe('live merge', () => {
  const snapshot = simulateSnapshot(KEY, simulateExpiries(KEY, NOW)[0]!, NOW, 3);
  const rows = snapshotToRows(snapshot);

  it('lists every visible contract key', () => {
    expect(contractKeysOf(rows)).toHaveLength(rows.length * 2);
  });

  it('overlays newer option ticks per leg and keeps untouched rows by reference', () => {
    const target = rows[2]!;
    const ceKey = target.ce!.contract.contractKey;
    const tick = simulateUpdate(ceKey, NOW + 60_000) as OptionTick;
    const updates: Record<string, MarketUpdate> = { [ceKey]: tick };
    const { rows: merged, changed } = mergeRowsLive(rows, updates);
    expect(changed).toHaveLength(1);
    expect(merged[2]).not.toBe(target);
    expect(merged[2]!.ce!.market.ltp).toBe(tick.ltp);
    expect(merged[2]!.ce!.market.updatedAt).toBe(NOW + 60_000);
    expect(merged[2]!.pe).toBe(target.pe);
    expect(merged[0]).toBe(rows[0]);
    // A stale tick never regresses the row.
    const old = { ...tick, timestamp: NOW - 1, ltp: 1 };
    expect(mergeRowsLive(merged, { [ceKey]: old }).changed).toHaveLength(0);
  });

  it('lets a newer index tick take over the header quote', () => {
    const base = snapshot.underlying;
    const tick = simulateUpdate(KEY, NOW + 5_000) as IndexTick;
    const merged = mergeUnderlyingLive(base, tick)!;
    expect(merged.updatedAt).toBe(NOW + 5_000);
    expect(merged.source).toBe('simulated');
    expect(mergeUnderlyingLive(base, { ...tick, timestamp: NOW - 1 })).toBe(base);
  });
});
