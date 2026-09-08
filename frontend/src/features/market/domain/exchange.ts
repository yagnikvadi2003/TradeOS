/**
 * Exchange domain model.
 *
 * Exchanges are the root of the market navigation hierarchy:
 * Exchange → MarketCategory → MarketIndex.
 */
export const EXCHANGE_CODES = ['NSE', 'BSE'] as const;
export type ExchangeCode = (typeof EXCHANGE_CODES)[number];

export type MarketTimezone = 'Asia/Kolkata';
export type MarketCurrency = 'INR';

export interface Exchange {
  readonly code: ExchangeCode;
  /** URL-safe identifier used in routes (`/markets/:exchange/...`). */
  readonly slug: string;
  readonly name: string;
  readonly fullName: string;
  readonly timezone: MarketTimezone;
  readonly currency: MarketCurrency;
  /** Display ordering (ascending). */
  readonly order: number;
}

export function isExchangeCode(value: string): value is ExchangeCode {
  return (EXCHANGE_CODES as readonly string[]).includes(value);
}
