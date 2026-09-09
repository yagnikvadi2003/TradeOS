import { describe, expect, it } from 'vitest';
import { simulateExpiries, simulateSnapshot } from '@/services/api/option-chain.simulator';
import { resolveActiveExpiry } from './active-expiry';
import { classifyFreshness } from './freshness';
import { diffRows, rowIdForStrike, snapshotToRows, windowRows } from './rows';
import { type OptionChainSnapshot } from './types';

const NOW = Date.UTC(2026, 8, 8, 5, 30); // Tue 08 Sep 2026 11:00 IST
const KEY = 'NSE:INDEX:NIFTY50' as const;

function snapshot(bucket = NOW, strikesEachSide = 15): OptionChainSnapshot {
  const expiry = simulateExpiries(KEY, NOW)[0]!;
  return simulateSnapshot(KEY, expiry, bucket, strikesEachSide);
}

describe('option-chain rows', () => {
  it('maps every strike to one row with a stable id and precomputed moneyness', () => {
    const rows = snapshotToRows(snapshot());
    expect(rows).toHaveLength(31);
    expect(rows.filter((r) => r.isAtm)).toHaveLength(1);
    const atm = rows.find((r) => r.isAtm)!;
    expect(atm.ceMoneyness).toBe('ATM');
    const below = rows.find((r) => r.stepsFromAtm === -2)!;
    expect(below.ceMoneyness).toBe('ITM');
    expect(below.peMoneyness).toBe('OTM');
    expect(rowIdForStrike(24000)).toBe('24000');
    expect(rowIdForStrike(24050.5)).toBe('24050.5');
  });

  it('windows rows around ATM inclusively and keeps all for null', () => {
    const rows = snapshotToRows(snapshot());
    expect(windowRows(rows, 2)).toHaveLength(5);
    expect(windowRows(rows, null)).toHaveLength(rows.length);
    expect(windowRows(rows, null)).not.toBe(rows);
  });

  it('produces an empty transaction for identical snapshots', () => {
    const rows = snapshotToRows(snapshot());
    const again = snapshotToRows(snapshot());
    const tx = diffRows(new Map(rows.map((r) => [r.id, r])), again);
    expect(tx).toEqual({ add: [], update: [], remove: [] });
  });

  it('emits updates only for strikes whose visible values changed', () => {
    const rows = snapshotToRows(snapshot());
    const later = snapshotToRows(snapshot(NOW + 60_000));
    const tx = diffRows(new Map(rows.map((r) => [r.id, r])), later);
    expect(tx.add).toEqual([]);
    expect(tx.remove).toEqual([]);
    expect(tx.update.length).toBeGreaterThan(0);
    expect(tx.update.length).toBeLessThanOrEqual(later.length);
  });

  it('adds and removes rows when the window changes', () => {
    const rows = snapshotToRows(snapshot());
    const narrow = windowRows(rows, 1);
    const tx = diffRows(new Map(narrow.map((r) => [r.id, r])), windowRows(rows, 2));
    expect(tx.add).toHaveLength(2);
    expect(tx.remove).toHaveLength(0);
    const back = diffRows(new Map(rows.map((r) => [r.id, r])), narrow);
    expect(back.remove).toHaveLength(rows.length - 3);
  });
});

describe('resolveActiveExpiry', () => {
  const expiries = simulateExpiries(KEY, NOW);
  it('keeps a listed selection, falls back to nearest, null when empty', () => {
    expect(resolveActiveExpiry(expiries, expiries[1]!.expiryDate)).toBe(expiries[1]!.expiryDate);
    expect(resolveActiveExpiry(expiries, '2020-01-01')).toBe(expiries[0]!.expiryDate);
    expect(resolveActiveExpiry(expiries, null)).toBe(expiries[0]!.expiryDate);
    expect(resolveActiveExpiry([], null)).toBeNull();
  });
});

describe('classifyFreshness', () => {
  it('thresholds at 5 s and 30 s', () => {
    expect(classifyFreshness(0)).toBe('fresh');
    expect(classifyFreshness(4_999)).toBe('fresh');
    expect(classifyFreshness(5_000)).toBe('aging');
    expect(classifyFreshness(30_000)).toBe('stale');
  });
});
