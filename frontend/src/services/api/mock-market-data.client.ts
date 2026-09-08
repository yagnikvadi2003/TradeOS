import {
  CANDLE_INTERVAL_SECONDS,
  type Candle,
  type CandleInterval,
  type CandleSeries,
} from '@/features/charts/domain';
import { marketCatalog } from '@/features/market/config';
import { type IndexQuote, type InstrumentKey } from '@/features/market/domain';
import { type MarketDataClient } from './market-data.client';

/**
 * Deterministic simulated market data for development and tests ONLY.
 *
 * - Never enabled in production builds (see `createMarketDataClient`).
 * - Every quote is tagged `source: 'simulated'` and the UI labels it.
 * - Values are a seeded random walk — plausible in scale, not real prices.
 *
 * The walk is seeded from the instrument key and the current time bucket so
 * repeated calls within a bucket return identical data (stable references,
 * no fake "ticks" from polling).
 */

/** Anchor level per instrument: order-of-magnitude only, so charts render at realistic scale. */
const ANCHOR_LEVEL: Record<string, number> = {
  'NSE:INDEX:NIFTY50': 24_000,
  'NSE:INDEX:BANKNIFTY': 52_000,
  'NSE:INDEX:FINNIFTY': 24_500,
  'NSE:INDEX:INDIAVIX': 14,
  'BSE:INDEX:SENSEX': 79_000,
  'BSE:INDEX:BANKEX': 58_000,
};

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Mulberry32 PRNG — small, fast, deterministic. */
function prng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface MockMarketDataOptions {
  /** Injected clock for tests. */
  readonly now?: () => number;
  /** Simulated network latency in ms (0 in tests). */
  readonly latencyMs?: number;
  /** Bucket size that keeps quotes stable between calls. */
  readonly quoteBucketMs?: number;
  /** When set, every call rejects — used to exercise error states. */
  readonly failWith?: Error;
}

export class MockMarketDataClient implements MarketDataClient {
  readonly kind = 'mock' as const;
  private readonly now: () => number;
  private readonly latencyMs: number;
  private readonly quoteBucketMs: number;
  private readonly failWith: Error | undefined;

  constructor(options: MockMarketDataOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.latencyMs = options.latencyMs ?? 120;
    this.quoteBucketMs = options.quoteBucketMs ?? 15_000;
    this.failWith = options.failWith;
  }

  private async delay(signal?: AbortSignal): Promise<void> {
    if (this.failWith) throw this.failWith;
    if (this.latencyMs <= 0) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, this.latencyMs);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
    });
  }

  private anchor(key: InstrumentKey): number {
    return ANCHOR_LEVEL[key] ?? 1_000;
  }

  private decimals(key: InstrumentKey): number {
    const instrument = marketCatalog.instrumentByKey(key);
    return instrument.tickSize < 0.01 ? 4 : 2;
  }

  private round(key: InstrumentKey, value: number): number {
    const factor = 10 ** this.decimals(key);
    return Math.round(value * factor) / factor;
  }

  private buildCandles(key: InstrumentKey, interval: CandleInterval, count: number): Candle[] {
    const step = CANDLE_INTERVAL_SECONDS[interval];
    const nowSec = Math.floor(this.now() / 1000);
    const lastBar = nowSec - (nowSec % step);
    const rand = prng(hashSeed(`${key}|${interval}|${lastBar}`));
    const anchor = this.anchor(key);
    const volatility = key.includes('INDIAVIX') ? 0.02 : 0.0025;
    const candles: Candle[] = [];
    let close = anchor * (0.97 + rand() * 0.06);
    for (let i = count - 1; i >= 0; i -= 1) {
      const time = lastBar - i * step;
      const open = close;
      const drift = (rand() - 0.5) * 2 * volatility * open;
      close = open + drift;
      const wick = Math.abs(rand()) * volatility * open;
      const high = Math.max(open, close) + wick;
      const low = Math.min(open, close) - wick;
      candles.push({
        time,
        open: this.round(key, open),
        high: this.round(key, high),
        low: this.round(key, low),
        close: this.round(key, close),
      });
    }
    return candles;
  }

  async getIndexQuotes(
    keys: readonly InstrumentKey[],
    signal?: AbortSignal,
  ): Promise<IndexQuote[]> {
    await this.delay(signal);
    const now = this.now();
    const bucket = now - (now % this.quoteBucketMs);
    return keys.map((key) => {
      const rand = prng(hashSeed(`${key}|quote|${bucket}`));
      const anchor = this.anchor(key);
      const volatility = key.includes('INDIAVIX') ? 0.08 : 0.012;
      const previousClose = this.round(key, anchor * (0.98 + rand() * 0.04));
      const open = this.round(key, previousClose * (1 + (rand() - 0.5) * volatility * 0.5));
      const ltp = this.round(key, previousClose * (1 + (rand() - 0.5) * volatility));
      const high = this.round(key, Math.max(open, ltp) * (1 + rand() * volatility * 0.3));
      const low = this.round(key, Math.min(open, ltp) * (1 - rand() * volatility * 0.3));
      const change = this.round(key, ltp - previousClose);
      const changePercent = Math.round((change / previousClose) * 10_000) / 100;
      return {
        instrumentKey: key,
        ltp,
        previousClose,
        open,
        high,
        low,
        change,
        changePercent,
        updatedAt: bucket,
        source: 'simulated',
      };
    });
  }

  async getCandles(
    key: InstrumentKey,
    interval: CandleInterval,
    signal?: AbortSignal,
  ): Promise<CandleSeries> {
    await this.delay(signal);
    const count = interval === '1d' ? 180 : 240;
    return { instrumentKey: key, interval, candles: this.buildCandles(key, interval, count) };
  }
}
