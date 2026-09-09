import { type InstrumentKey, type OptionContractKey } from '@/common/market/market-primitives';

/**
 * Where a value came from. `simulated` is only ever produced by the mock
 * provider and is surfaced to the UI so development data is never mistaken
 * for a market feed.
 */
export type MarketDataSource = 'live' | 'snapshot' | 'simulated';

export interface OptionGreeks {
  readonly delta: number;
  readonly gamma: number;
  readonly theta: number;
  readonly vega: number;
  readonly rho?: number;
}

/**
 * Realtime state of one option contract. Everything is optional except the
 * identity and timestamp: providers differ in what they publish, and the UI
 * renders a dash rather than a fabricated zero.
 */
export interface OptionMarketData {
  readonly contractKey: OptionContractKey;
  readonly ltp: number | null;
  readonly previousClose: number | null;
  readonly change: number | null;
  readonly changePercent: number | null;
  readonly volume: number | null;
  readonly openInterest: number | null;
  readonly openInterestChange: number | null;
  /** Implied volatility in percent (e.g. 14.2). */
  readonly impliedVolatility: number | null;
  readonly bid: number | null;
  readonly ask: number | null;
  readonly bidQuantity: number | null;
  readonly askQuantity: number | null;
  readonly greeks: OptionGreeks | null;
  /** Epoch ms of the last provider update for this contract. */
  readonly updatedAt: number;
  readonly source: MarketDataSource;
}

export interface UnderlyingMarketData {
  readonly instrumentKey: InstrumentKey;
  readonly ltp: number;
  readonly previousClose: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly change: number;
  readonly changePercent: number;
  readonly updatedAt: number;
  readonly source: MarketDataSource;
}
