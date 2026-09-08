import { describe, expect, it } from 'vitest';
import { marketCatalog } from '@/features/market/config';
import { MockMarketDataClient } from './mock-market-data.client';

const NOW = Date.UTC(2026, 8, 8, 5, 30);

describe('MockMarketDataClient', () => {
  const client = new MockMarketDataClient({ latencyMs: 0, now: () => NOW });
  const keys = marketCatalog.indexes().map((i) => i.instrumentKey);

  it('tags every quote as simulated and keeps arithmetic consistent', async () => {
    const quotes = await client.getIndexQuotes(keys);
    expect(quotes).toHaveLength(6);
    for (const q of quotes) {
      expect(q.source).toBe('simulated');
      expect(q.high).toBeGreaterThanOrEqual(Math.max(q.open, q.ltp));
      expect(q.low).toBeLessThanOrEqual(Math.min(q.open, q.ltp));
      expect(q.change).toBeCloseTo(q.ltp - q.previousClose, 2);
    }
  });

  it('is deterministic within a time bucket', async () => {
    const a = await client.getIndexQuotes(keys);
    const b = await client.getIndexQuotes(keys);
    expect(a).toEqual(b);
  });

  it('produces well-formed candles in ascending time', async () => {
    const series = await client.getCandles('NSE:INDEX:NIFTY50', '5m');
    expect(series.candles.length).toBeGreaterThan(100);
    for (let i = 1; i < series.candles.length; i += 1) {
      const prev = series.candles[i - 1]!;
      const c = series.candles[i]!;
      expect(c.time - prev.time).toBe(300);
      expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close));
      expect(c.low).toBeLessThanOrEqual(Math.min(c.open, c.close));
    }
  });

  it('propagates injected failures', async () => {
    const failing = new MockMarketDataClient({ latencyMs: 0, failWith: new Error('boom') });
    await expect(failing.getIndexQuotes(keys)).rejects.toThrow('boom');
  });
});
