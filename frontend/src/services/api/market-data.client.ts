import { type Candle, type CandleInterval, type CandleSeries } from '@/features/charts/domain';
import { type IndexQuote, type InstrumentKey } from '@/features/market/domain';

/**
 * Frontend-facing market data port. Implementations: HTTP (backend REST) and
 * Mock (deterministic simulation for development/tests). The UI depends on
 * this interface only — never on a provider SDK.
 */
export interface MarketDataClient {
  readonly kind: 'http' | 'mock';
  getIndexQuotes(keys: readonly InstrumentKey[], signal?: AbortSignal): Promise<IndexQuote[]>;
  getCandles(
    key: InstrumentKey,
    interval: CandleInterval,
    signal?: AbortSignal,
  ): Promise<CandleSeries>;
}

export type { Candle, CandleInterval, CandleSeries, IndexQuote, InstrumentKey };
