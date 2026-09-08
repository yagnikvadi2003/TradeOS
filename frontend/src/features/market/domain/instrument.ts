import { type ExchangeCode, type MarketCurrency } from './exchange';

/**
 * Instrument domain model.
 *
 * An instrument is the quotable entity behind a navigation index. The
 * `instrumentKey` is TradeOS' own provider-agnostic identifier; provider
 * symbols (Upstox instrument keys, etc.) are mapped to it inside the backend
 * provider adapter and never leak to the frontend.
 *
 * Format: `<EXCHANGE>:<SEGMENT>:<SYMBOL>` — e.g. `NSE:INDEX:NIFTY50`.
 */
export const INSTRUMENT_SEGMENTS = ['INDEX'] as const;
export type InstrumentSegment = (typeof INSTRUMENT_SEGMENTS)[number];

export type InstrumentKey = `${ExchangeCode}:${InstrumentSegment}:${string}`;

/**
 * Nature of the underlying series. Volatility indexes are derived series
 * (no cash market, no option chain); equity indexes can carry derivatives.
 */
export type InstrumentKind = 'EQUITY_INDEX' | 'VOLATILITY_INDEX';

export interface Instrument {
  readonly instrumentKey: InstrumentKey;
  readonly symbol: string;
  readonly name: string;
  readonly exchangeCode: ExchangeCode;
  readonly segment: InstrumentSegment;
  readonly kind: InstrumentKind;
  readonly currency: MarketCurrency;
  /** Minimum price increment used for display precision. */
  readonly tickSize: number;
}

export function buildInstrumentKey(
  exchange: ExchangeCode,
  segment: InstrumentSegment,
  symbol: string,
): InstrumentKey {
  return `${exchange}:${segment}:${symbol}`;
}
