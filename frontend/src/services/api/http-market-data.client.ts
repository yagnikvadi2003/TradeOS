import type { CandleInterval, CandleSeries } from '@/features/charts/domain';
import type { IndexQuote, InstrumentKey } from '@/features/market/domain';
import type { HttpClient } from './http-client';
import type { MarketDataClient } from './market-data.client';
import { candlesResponseSchema, indexQuotesResponseSchema } from './schemas';

/**
 * Backend REST adapter (phase 2+ endpoints). Quote snapshots and historical
 * candles are REST; realtime updates will arrive over the application
 * WebSocket, never via polling.
 */
export class HttpMarketDataClient implements MarketDataClient {
  readonly kind = 'http' as const;

  constructor(private readonly http: HttpClient) {}

  async getIndexQuotes(
    keys: readonly InstrumentKey[],
    signal?: AbortSignal,
  ): Promise<IndexQuote[]> {
    if (keys.length === 0) return [];
    const query = encodeURIComponent(keys.join(','));
    const response = await this.http.get(
      `/market/quotes?instrumentKeys=${query}`,
      indexQuotesResponseSchema,
      signal,
    );
    return response.data.map((dto) => ({
      ...dto,
      instrumentKey: dto.instrumentKey as InstrumentKey,
    }));
  }

  async getCandles(
    key: InstrumentKey,
    interval: CandleInterval,
    signal?: AbortSignal,
  ): Promise<CandleSeries> {
    const response = await this.http.get(
      `/charts/${encodeURIComponent(key)}/candles?interval=${interval}`,
      candlesResponseSchema,
      signal,
    );
    return {
      instrumentKey: response.data.instrumentKey as InstrumentKey,
      interval: response.data.interval,
      candles: response.data.candles.map((c) =>
        c.volume === undefined
          ? { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close }
          : {
              time: c.time,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
              volume: c.volume,
            },
      ),
    };
  }
}
