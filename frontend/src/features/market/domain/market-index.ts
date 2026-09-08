import { type ExchangeCode } from './exchange';
import { type InstrumentKey, type InstrumentKind } from './instrument';
import { type MarketCategoryCode } from './market-category';

export const MARKET_INDEX_CODES = [
  'NIFTY_50',
  'BANK_NIFTY',
  'FINNIFTY',
  'INDIA_VIX',
  'SENSEX',
  'BANKEX',
] as const;
export type MarketIndexCode = (typeof MARKET_INDEX_CODES)[number];

/**
 * Explicit capability flags. Feature availability (e.g. the Option Chain
 * action) MUST be decided from these flags — never from display names,
 * categories or heuristics.
 */
export interface MarketIndexCapabilities {
  /** Index has a listed option chain (weekly/monthly expiries). */
  readonly hasOptionChain: boolean;
  /** Index exposes a price/level chart. */
  readonly hasChart: boolean;
}

export interface MarketIndex {
  readonly code: MarketIndexCode;
  /** URL-safe identifier used in routes (`/markets/:exchange/:category/:index`). */
  readonly slug: string;
  readonly name: string;
  /** Compact label for dense surfaces (ticker strip, tree rows). */
  readonly shortName: string;
  readonly exchangeCode: ExchangeCode;
  readonly categoryCode: MarketCategoryCode;
  readonly kind: InstrumentKind;
  readonly instrumentKey: InstrumentKey;
  readonly capabilities: MarketIndexCapabilities;
  /** One-line, user-facing description used on public pages / SEO. */
  readonly description: string;
  /** Display ordering inside a category group (ascending). */
  readonly order: number;
}

export function isMarketIndexCode(value: string): value is MarketIndexCode {
  return (MARKET_INDEX_CODES as readonly string[]).includes(value);
}
