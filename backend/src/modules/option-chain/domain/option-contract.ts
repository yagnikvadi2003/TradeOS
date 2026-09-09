import {
  type ExchangeCode,
  type InstrumentKey,
  type IsoDate,
  type OptionContractKey,
  type OptionType,
} from '@/common/market/market-primitives';

/**
 * Static description of a listed option contract. Pure metadata: nothing here
 * changes intraday, so it is safe to persist and cache for a long time.
 */
export interface OptionContract {
  readonly contractKey: OptionContractKey;
  readonly underlyingKey: InstrumentKey;
  readonly exchangeCode: ExchangeCode;
  readonly tradingSymbol: string;
  readonly expiryDate: IsoDate;
  readonly strike: number;
  readonly optionType: OptionType;
  readonly lotSize: number;
  readonly tickSize: number;
}
