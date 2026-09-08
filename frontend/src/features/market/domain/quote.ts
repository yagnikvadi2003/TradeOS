import { type InstrumentKey } from './instrument';

/**
 * Where a quote came from. Surfaced in the UI so simulated development data
 * can never be mistaken for a live market feed.
 */
export type QuoteSource = 'live' | 'snapshot' | 'simulated';

export interface IndexQuote {
  readonly instrumentKey: InstrumentKey;
  /** Last traded / calculated level. */
  readonly ltp: number;
  readonly previousClose: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  /** Absolute change vs previous close. */
  readonly change: number;
  /** Percentage change vs previous close (e.g. 0.46 for +0.46%). */
  readonly changePercent: number;
  /** Epoch milliseconds of the last update. */
  readonly updatedAt: number;
  readonly source: QuoteSource;
}

export type ChangeDirection = 'up' | 'down' | 'flat';

export function directionOf(change: number): ChangeDirection {
  if (change > 0) return 'up';
  if (change < 0) return 'down';
  return 'flat';
}
