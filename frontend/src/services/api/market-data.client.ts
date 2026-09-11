import { type Candle, type CandleInterval, type CandleSeries } from '@/features/charts/domain';
import { type IndexQuote, type InstrumentKey } from '@/features/market/domain';
import {
  type Expiry,
  type IsoDate,
  type OptionChainMetadata,
  type OptionChainSnapshot,
} from '@/features/option-chain/domain';

/**
 * Frontend-facing market data port. Implementations: HTTP (backend REST) and
 * Mock (deterministic simulation for development/tests). The UI depends on
 * this interface only — never on a provider SDK.
 */
export interface RealtimeToken {
  readonly token: string;
  readonly expiresAt: number;
}

export interface MarketDataClient {
  readonly kind: 'http' | 'mock';
  getIndexQuotes(keys: readonly InstrumentKey[], signal?: AbortSignal): Promise<IndexQuote[]>;
  /** Short-lived session token for the market WebSocket. */
  getRealtimeToken(signal?: AbortSignal): Promise<RealtimeToken>;
  getCandles(
    key: InstrumentKey,
    interval: CandleInterval,
    signal?: AbortSignal,
  ): Promise<CandleSeries>;
  getOptionChainMetadata(key: InstrumentKey, signal?: AbortSignal): Promise<OptionChainMetadata>;
  getOptionChainExpiries(key: InstrumentKey, signal?: AbortSignal): Promise<Expiry[]>;
  /** Full chain snapshot for one expiry (nearest listed when omitted). Never polled. */
  getOptionChainSnapshot(
    key: InstrumentKey,
    expiry: IsoDate | null,
    signal?: AbortSignal,
  ): Promise<OptionChainSnapshot>;
}

export type { Candle, CandleInterval, CandleSeries, IndexQuote, InstrumentKey };
