import {
  type ExchangeCode,
  type InstrumentKey,
  type IsoDate,
  type OptionContractKey,
  type OptionType,
} from '@/common/market/market-primitives';
import { type MarketDataSource, type OptionGreeks } from '@/modules/option-chain/domain';

/**
 * Normalized realtime contracts. Everything a provider cannot supply is an
 * explicit `null` — consumers never guess and never see a fabricated zero.
 * `timestamp` is the provider's event time; `receivedAt` is ours.
 */
export interface IndexTick {
  readonly kind: 'index';
  readonly instrumentKey: InstrumentKey;
  readonly timestamp: number;
  readonly receivedAt: number;
  readonly ltp: number | null;
  readonly previousClose: number | null;
  readonly open: number | null;
  readonly high: number | null;
  readonly low: number | null;
  readonly change: number | null;
  readonly changePercent: number | null;
  readonly volume: number | null;
  readonly source: MarketDataSource;
}

export interface OptionTick {
  readonly kind: 'option';
  readonly contractKey: OptionContractKey;
  readonly underlyingKey: InstrumentKey;
  readonly exchangeCode: ExchangeCode;
  readonly expiryDate: IsoDate;
  readonly strike: number;
  readonly optionType: OptionType;
  readonly timestamp: number;
  readonly receivedAt: number;
  readonly ltp: number | null;
  readonly previousClose: number | null;
  readonly change: number | null;
  readonly changePercent: number | null;
  readonly volume: number | null;
  readonly openInterest: number | null;
  readonly openInterestChange: number | null;
  readonly impliedVolatility: number | null;
  readonly bid: number | null;
  readonly ask: number | null;
  readonly bidQuantity: number | null;
  readonly askQuantity: number | null;
  readonly greeks: OptionGreeks | null;
  readonly source: MarketDataSource;
}

export type MarketUpdate = IndexTick | OptionTick;

/** Stream key: the TradeOS instrument key for an index, contract key for an option. */
export type StreamKey = InstrumentKey | OptionContractKey;

export function streamKeyOf(update: MarketUpdate): StreamKey {
  return update.kind === 'index' ? update.instrumentKey : update.contractKey;
}

export type MarketSegmentStatus =
  | 'PRE_OPEN_START'
  | 'PRE_OPEN_END'
  | 'NORMAL_OPEN'
  | 'NORMAL_CLOSE'
  | 'CLOSING_START'
  | 'CLOSING_END'
  | 'UNKNOWN';

export interface MarketStatusUpdate {
  readonly exchangeCode: ExchangeCode;
  readonly segment: 'INDEX' | 'FO';
  readonly status: MarketSegmentStatus;
  readonly timestamp: number;
}
