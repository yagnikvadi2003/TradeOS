import { type InstrumentKey, type IsoDate } from '@/common/market/market-primitives';
import { type OptionContract } from './option-contract';
import { type Expiry } from './expiry';
import {
  type MarketDataSource,
  type OptionMarketData,
  type UnderlyingMarketData,
} from './market-data';

/** Value decomposition derived server-side from the underlying level. */
export interface OptionValueBreakdown {
  readonly intrinsic: number;
  readonly extrinsic: number | null;
  /** ask − bid when both are available (derived). */
  readonly spread: number | null;
}

export interface OptionLeg {
  readonly contract: OptionContract;
  readonly market: OptionMarketData;
  readonly value: OptionValueBreakdown;
}

export type Moneyness = 'ITM' | 'ATM' | 'OTM';

export interface OptionStrike {
  readonly strike: number;
  readonly isAtm: boolean;
  /** Signed number of strike steps from ATM (negative below). */
  readonly stepsFromAtm: number;
  readonly ce: OptionLeg | null;
  readonly pe: OptionLeg | null;
}

export interface OptionChainTotals {
  readonly ceOpenInterest: number;
  readonly peOpenInterest: number;
  readonly ceVolume: number;
  readonly peVolume: number;
  /** PE OI / CE OI; null when CE OI is zero. */
  readonly putCallRatio: number | null;
}

/** TradeOS-derived analytics; see `option-analytics.ts`. Never provider facts. */
export interface OptionAnalyticsSummary {
  readonly derived: true;
  readonly oiPcr: number | null;
  readonly volumePcr: number | null;
  readonly maxPain: number | null;
  readonly atmIv: number | null;
  readonly oiConcentration: { readonly ce: StrikeWeight[]; readonly pe: StrikeWeight[] };
  readonly oiChangeConcentration: { readonly ce: StrikeWeight[]; readonly pe: StrikeWeight[] };
  readonly volumeConcentration: { readonly ce: StrikeWeight[]; readonly pe: StrikeWeight[] };
  readonly supportCandidates: number[];
  readonly resistanceCandidates: number[];
}
export interface StrikeWeight {
  readonly strike: number;
  readonly value: number;
  readonly share: number;
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
  readonly analytics: OptionAnalyticsSummary;
  /** Epoch ms the snapshot was assembled. */
  readonly asOf: number;
  /** Oldest contract update in the snapshot; drives the freshness indicator. */
  readonly oldestUpdateAt: number;
  readonly source: MarketDataSource;
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

export type { MarketDataSource, OptionMarketData, UnderlyingMarketData };
