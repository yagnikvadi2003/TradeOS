import { describe, expect, it } from 'vitest';
import { type Candle } from './domain/candle';
import { atr, bollinger, ema, macd, rsi, sma, vwap } from './indicators';

const closes = [10, 11, 12, 13, 14, 15, 14, 13, 12, 11, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
const candles: Candle[] = closes.map((close, i) => ({
  time: 1_700_000_000 + i * 60,
  open: close,
  high: close + 1,
  low: close - 1,
  close,
  volume: 100,
}));

describe('indicators', () => {
  it('sma/ema warm up with nulls then track the series', () => {
    const s = sma(closes, 3);
    expect(s.slice(0, 2)).toEqual([null, null]);
    expect(s[2]).toBe(11);
    expect(s[19]).toBe(18);
    const e = ema(closes, 3);
    expect(e[1]).toBeNull();
    expect(e[2]).toBe(11);
    expect(e[19]!).toBeGreaterThan(17.5);
  });

  it('rsi stays within 0–100 and rises on an up-trend', () => {
    const r = rsi(candles, 14);
    expect(r[13]).toBeNull();
    expect(r[14]!).toBeGreaterThan(0);
    for (const v of r) if (v !== null) expect(v).toBeLessThanOrEqual(100);
    expect(r[19]!).toBeGreaterThan(r[14]!);
  });

  it('macd, bollinger and atr are aligned to input length', () => {
    const m = macd(candles, 3, 6, 3);
    expect(m.macd).toHaveLength(20);
    expect(m.histogram[19]).not.toBeNull();
    const b = bollinger(candles, 5, 2);
    expect(b.upper[19]!).toBeGreaterThan(b.middle[19]!);
    expect(b.lower[19]!).toBeLessThan(b.middle[19]!);
    const a = atr(candles, 5);
    expect(a[3]).toBeNull();
    expect(a[19]!).toBeGreaterThan(1.5); // gap-up closes push true range past the 2-point bar range
  });

  it('vwap requires volume and follows typical price', () => {
    const v = vwap(candles);
    expect(v[0]).toBe(10);
    expect(v[19]!).toBeGreaterThan(13);
    expect(vwap(candles.map(({ volume: _v, ...c }) => c))[5]).toBeNull();
  });
});
