import { type ExchangeCode } from './exchange';

/**
 * Trading phase of an exchange. Phase 1 derives this on the client from the
 * regular session schedule; the backend market-calendar module (holidays,
 * special sessions, muhurat trading) becomes the authoritative source later.
 */
export const MARKET_PHASES = ['PRE_OPEN', 'OPEN', 'POST_CLOSE', 'CLOSED', 'UNKNOWN'] as const;
export type MarketPhase = (typeof MARKET_PHASES)[number];

export interface MarketStatus {
  readonly exchangeCode: ExchangeCode;
  readonly phase: MarketPhase;
  /** Epoch milliseconds at which this status was evaluated. */
  readonly asOf: number;
  /** Epoch milliseconds of the next scheduled phase change, when known. */
  readonly nextTransitionAt: number | null;
  /** True when the current date is a regular trading day (weekday). */
  readonly isTradingDay: boolean;
}

/** Minutes since midnight, local to the exchange timezone. */
export interface SessionWindow {
  readonly startMinutes: number;
  readonly endMinutes: number;
}

export interface MarketSessionSchedule {
  readonly exchangeCode: ExchangeCode;
  readonly preOpen: SessionWindow;
  readonly regular: SessionWindow;
  readonly postClose: SessionWindow;
  /** ISO weekday numbers (1 = Monday … 7 = Sunday) on which the market trades. */
  readonly tradingWeekdays: readonly number[];
}
