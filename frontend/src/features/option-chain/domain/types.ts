import { type OptionAnalytics } from './analytics';
import { type ExchangeCode, type InstrumentKey, type QuoteSource } from '@/features/market/domain';

/**
 * Normalized option-chain domain for the frontend. Mirrors the backend v1
 * DTOs after Zod validation; never resembles a provider payload.
 */
export const OPTION_TYPES = ['CE', 'PE'] as const;
export type OptionType = (typeof OPTION_TYPES)[number];

export const EXPIRY_CYCLES = ['WEEKLY', 'MONTHLY', 'QUARTERLY'] as const;
export type ExpiryCycle = (typeof EXPIRY_CYCLES)[number];

/** `YYYY-MM-DD` in IST. */
export type IsoDate = string;

/** `NSE:OPT:NIFTY50:2026-09-16:24000:CE` */
export type OptionContractKey = string;

export interface Expiry {
  readonly instrumentKey: InstrumentKey;
  readonly expiryDate: IsoDate;
  readonly cycle: ExpiryCycle;
  readonly daysToExpiry: number;
}

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

export interface OptionGreeks {
  readonly delta: number;
  readonly gamma: number;
  readonly theta: number;
  readonly vega: number;
  readonly rho?: number | undefined;
}

/** Nullable fields render as a dash — the UI never fabricates a zero. */
export interface OptionMarketData {
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
  readonly intrinsic: number;
  readonly extrinsic: number | null;
  /** ask − bid when both quoted (derived). */
  readonly spread: number | null;
  readonly updatedAt: number;
}

export interface OptionLeg {
  readonly contract: OptionContract;
  readonly market: OptionMarketData;
}

export interface OptionStrike {
  readonly strike: number;
  readonly isAtm: boolean;
  /** Signed strike steps from ATM (negative below). */
  readonly stepsFromAtm: number;
  readonly ce: OptionLeg | null;
  readonly pe: OptionLeg | null;
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
  readonly source: QuoteSource;
}

export interface OptionChainTotals {
  readonly ceOpenInterest: number;
  readonly peOpenInterest: number;
  readonly ceVolume: number;
  readonly peVolume: number;
  readonly putCallRatio: number | null;
}

export interface OptionChainSnapshot {
  readonly instrumentKey: InstrumentKey;
  readonly expiry: Expiry;
  readonly underlying: UnderlyingMarketData;
  readonly atmStrike: number;
  readonly strikeStep: number;
  readonly lotSize: number;
  readonly strikes: readonly OptionStrike[];
  readonly totals: OptionChainTotals;
  readonly analytics: OptionAnalytics;
  readonly asOf: number;
  readonly oldestUpdateAt: number;
  readonly source: QuoteSource;
}

export interface OptionChainMetadata {
  readonly instrumentKey: InstrumentKey;
  readonly symbol: string;
  readonly name: string;
  readonly strikeStep: number;
  readonly lotSize: number;
  readonly expiries: readonly Expiry[];
  readonly nearestExpiry: IsoDate | null;
}

export type Moneyness = 'ITM' | 'ATM' | 'OTM';

/**
 * Grid row. One per strike with both legs flattened alongside so AG Grid can
 * address cells with dot-path fields (`ce.market.ltp`). `id` is the stable
 * row identity for transactions; `moneyness` is precomputed per leg.
 */
export interface OptionChainRow {
  readonly id: string;
  readonly strike: number;
  readonly isAtm: boolean;
  readonly stepsFromAtm: number;
  readonly ce: OptionLeg | null;
  readonly pe: OptionLeg | null;
  readonly ceMoneyness: Moneyness;
  readonly peMoneyness: Moneyness;
}
