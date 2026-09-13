import { Inject, Injectable } from '@nestjs/common';
import { InstrumentNotFoundError } from '@/common/errors/domain-error';
import { type InstrumentKey } from '@/common/market/market-primitives';
import { CACHE_STORE, type CacheStore } from '@/infrastructure/cache/cache-store.interface';
import { catalogInstrument } from '@/modules/instruments/instrument.catalog';
import { MARKET_DATA_PROVIDER, type MarketDataProvider } from '@/providers/provider.interface';
import {
  CANDLE_DEFAULT_COUNT,
  CANDLE_INTERVAL_SECONDS,
  type CandleInterval,
  type CandleSeries,
} from './domain/candle';

/**
 * Historical candles are non-realtime: cached per (instrument, interval) for
 * one bar length (min 15 s) and coalesced in flight, so a page of users on the
 * same chart costs one provider call per bar. Live movement is the stream's
 * job; the chart's last bar is patched client-side from ticks.
 */
@Injectable()
export class ChartsService {
  private readonly inflight = new Map<string, Promise<CandleSeries>>();

  constructor(
    @Inject(MARKET_DATA_PROVIDER) private readonly provider: MarketDataProvider,
    @Inject(CACHE_STORE) private readonly cache: CacheStore,
  ) {}

  async getCandles(
    instrumentKey: InstrumentKey,
    interval: CandleInterval,
    limit?: number,
  ): Promise<CandleSeries> {
    if (!catalogInstrument(instrumentKey)) throw new InstrumentNotFoundError(instrumentKey);
    const count = Math.min(limit ?? CANDLE_DEFAULT_COUNT[interval], 2_000);
    const cacheKey = `candles:${instrumentKey}:${interval}`;
    const cached = await this.cache.get<CandleSeries>(cacheKey);
    if (cached) return trim(cached, count);
    let pending = this.inflight.get(cacheKey);
    if (!pending) {
      pending = this.provider
        .getCandles(instrumentKey, interval, Math.max(count, CANDLE_DEFAULT_COUNT[interval]))
        .then(async (series) => {
          const ttlMs = Math.max(
            15_000,
            Math.min(CANDLE_INTERVAL_SECONDS[interval] * 1_000, 5 * 60_000),
          );
          await this.cache.set(cacheKey, series, ttlMs);
          return series;
        })
        .finally(() => this.inflight.delete(cacheKey));
      this.inflight.set(cacheKey, pending);
    }
    return trim(await pending, count);
  }
}

function trim(series: CandleSeries, count: number): CandleSeries {
  return series.candles.length <= count
    ? series
    : { ...series, candles: series.candles.slice(-count) };
}
