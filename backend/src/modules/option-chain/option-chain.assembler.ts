import { computeOptionAnalytics } from './option-analytics';
import { type InstrumentKey } from '@/common/market/market-primitives';
import {
  type Expiry,
  type MarketDataSource,
  type OptionChainSnapshot,
  type OptionChainTotals,
  type OptionContract,
  type OptionLeg,
  type OptionMarketData,
  type OptionStrike,
  type UnderlyingMarketData,
} from './domain';

export interface AssembleInput {
  readonly instrumentKey: InstrumentKey;
  readonly expiry: Expiry;
  readonly underlying: UnderlyingMarketData;
  readonly contracts: readonly OptionContract[];
  readonly marketData: readonly OptionMarketData[];
  readonly strikeStep: number;
  readonly lotSize: number;
  readonly asOf: number;
}

/** Nearest listed strike to the level (ties resolve to the lower strike). */
export function resolveAtmStrike(level: number, strikes: readonly number[]): number {
  let best = strikes[0] ?? 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const strike of strikes) {
    const distance = Math.abs(strike - level);
    if (distance < bestDistance) {
      best = strike;
      bestDistance = distance;
    }
  }
  return best;
}

function intrinsicOf(contract: OptionContract, level: number): number {
  const raw = contract.optionType === 'CE' ? level - contract.strike : contract.strike - level;
  return Math.max(0, Math.round(raw * 100) / 100);
}

function leg(contract: OptionContract, market: OptionMarketData, level: number): OptionLeg {
  const intrinsic = intrinsicOf(contract, level);
  const extrinsic = market.ltp === null ? null : Math.round((market.ltp - intrinsic) * 100) / 100;
  const spread =
    market.bid !== null && market.ask !== null && market.ask >= market.bid
      ? Math.round((market.ask - market.bid) * 100) / 100
      : null;
  return { contract, market, value: { intrinsic, extrinsic, spread } };
}

/** Placeholder market row when the provider returned nothing for a listed contract. */
function emptyMarket(
  contract: OptionContract,
  source: MarketDataSource,
  at: number,
): OptionMarketData {
  return {
    contractKey: contract.contractKey,
    ltp: null,
    previousClose: null,
    change: null,
    changePercent: null,
    volume: null,
    openInterest: null,
    openInterestChange: null,
    impliedVolatility: null,
    bid: null,
    ask: null,
    bidQuantity: null,
    askQuantity: null,
    greeks: null,
    updatedAt: at,
    source,
  };
}

/**
 * Pure assembly of a chain snapshot: groups contracts by strike, attaches
 * market data by contract key (O(n) via Map), derives ATM, moneyness steps,
 * intrinsic/extrinsic value and OI/volume totals. No I/O, no provider types.
 */
export function assembleOptionChain(input: AssembleInput): OptionChainSnapshot {
  const { underlying, contracts, strikeStep } = input;
  const marketByKey = new Map<string, OptionMarketData>();
  for (const row of input.marketData) marketByKey.set(row.contractKey, row);

  const byStrike = new Map<number, { ce: OptionLeg | null; pe: OptionLeg | null }>();
  let oldestUpdateAt = Number.POSITIVE_INFINITY;
  let anyData = false;
  for (const contract of contracts) {
    const market = marketByKey.get(contract.contractKey);
    const resolved = market ?? emptyMarket(contract, underlying.source, input.asOf);
    if (market) {
      anyData = true;
      if (market.updatedAt < oldestUpdateAt) oldestUpdateAt = market.updatedAt;
    }
    let entry = byStrike.get(contract.strike);
    if (!entry) {
      entry = { ce: null, pe: null };
      byStrike.set(contract.strike, entry);
    }
    const built = leg(contract, resolved, underlying.ltp);
    if (contract.optionType === 'CE') entry.ce = built;
    else entry.pe = built;
  }

  const strikeLevels = [...byStrike.keys()].sort((a, b) => a - b);
  const atmStrike = resolveAtmStrike(underlying.ltp, strikeLevels);

  const totals = { ceOpenInterest: 0, peOpenInterest: 0, ceVolume: 0, peVolume: 0 };
  const strikes: OptionStrike[] = strikeLevels.map((strike) => {
    const entry = byStrike.get(strike)!;
    totals.ceOpenInterest += entry.ce?.market.openInterest ?? 0;
    totals.peOpenInterest += entry.pe?.market.openInterest ?? 0;
    totals.ceVolume += entry.ce?.market.volume ?? 0;
    totals.peVolume += entry.pe?.market.volume ?? 0;
    return {
      strike,
      isAtm: strike === atmStrike,
      stepsFromAtm: Math.round((strike - atmStrike) / strikeStep),
      ce: entry.ce,
      pe: entry.pe,
    };
  });

  const chainTotals: OptionChainTotals = {
    ...totals,
    putCallRatio:
      totals.ceOpenInterest > 0
        ? Math.round((totals.peOpenInterest / totals.ceOpenInterest) * 1000) / 1000
        : null,
  };

  return {
    instrumentKey: input.instrumentKey,
    expiry: input.expiry,
    underlying,
    atmStrike,
    strikeStep,
    lotSize: input.lotSize,
    strikes,
    totals: chainTotals,
    analytics: computeOptionAnalytics(strikes, atmStrike, underlying.ltp),
    asOf: input.asOf,
    oldestUpdateAt: anyData ? oldestUpdateAt : input.asOf,
    source: underlying.source,
  };
}
