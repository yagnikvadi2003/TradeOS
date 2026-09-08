/**
 * Market category domain model.
 *
 * Categories group indexes inside an exchange (Benchmark, Financial, Volatility).
 * The category set is global; which categories an exchange exposes is derived
 * from the indexes registered in the market configuration.
 */
export const MARKET_CATEGORY_CODES = ['BENCHMARK', 'FINANCIAL', 'VOLATILITY'] as const;
export type MarketCategoryCode = (typeof MARKET_CATEGORY_CODES)[number];

export interface MarketCategory {
  readonly code: MarketCategoryCode;
  /** URL-safe identifier used in routes (`/markets/:exchange/:category/...`). */
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  /** Display ordering inside an exchange group (ascending). */
  readonly order: number;
}

export function isMarketCategoryCode(value: string): value is MarketCategoryCode {
  return (MARKET_CATEGORY_CODES as readonly string[]).includes(value);
}
