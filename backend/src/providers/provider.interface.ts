import {
  type ExpiryCycle,
  type InstrumentKey,
  type IsoDate,
  type OptionContractKey,
} from '@/common/market/market-primitives';
import { type CandleInterval, type CandleSeries } from '@/modules/charts/domain/candle';
import {
  type MarketDataSource,
  type OptionContract,
  type OptionMarketData,
  type UnderlyingMarketData,
} from '@/modules/option-chain/domain';

export type MarketDataProviderName = 'mock' | 'upstox';

export interface ProviderExpiry {
  readonly expiryDate: IsoDate;
  readonly cycle: ExpiryCycle;
}

/**
 * Market-data provider port.
 *
 * Every adapter (mock today, Upstox next) validates the provider's raw payload
 * at its own boundary and returns TradeOS domain types. The option-chain
 * domain depends on this interface only, so a provider swap never touches it.
 *
 * Contract identity is always the TradeOS `instrumentKey` / `contractKey`;
 * mapping to provider symbols is the adapter's responsibility.
 */
export interface MarketDataProvider {
  readonly name: MarketDataProviderName;
  /** Provenance tag applied to every value this provider emits. */
  readonly dataSource: MarketDataSource;
  listExpiries(instrumentKey: InstrumentKey): Promise<readonly ProviderExpiry[]>;
  listOptionContracts(
    instrumentKey: InstrumentKey,
    expiryDate: IsoDate,
  ): Promise<readonly OptionContract[]>;
  getUnderlyingQuote(instrumentKey: InstrumentKey): Promise<UnderlyingMarketData>;
  getOptionMarketData(
    contractKeys: readonly OptionContractKey[],
  ): Promise<readonly OptionMarketData[]>;
  /** Historical bars, oldest first, at most `count` (the newest). */
  getCandles(
    instrumentKey: InstrumentKey,
    interval: CandleInterval,
    count: number,
  ): Promise<CandleSeries>;
}

export const MARKET_DATA_PROVIDER = Symbol('MARKET_DATA_PROVIDER');
