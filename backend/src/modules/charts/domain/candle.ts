import { type InstrumentKey } from '@/common/market/market-primitives';

export const CANDLE_INTERVALS = ['1m', '5m', '15m', '1h', '1d'] as const;
export type CandleInterval = (typeof CANDLE_INTERVALS)[number];

export const CANDLE_INTERVAL_SECONDS: Record<CandleInterval, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3_600,
  '1d': 86_400,
};

/** Default depth per interval — enough for indicators without bulk transfer. */
export const CANDLE_DEFAULT_COUNT: Record<CandleInterval, number> = {
  '1m': 375, // one session
  '5m': 375, // five sessions
  '15m': 400,
  '1h': 400,
  '1d': 250, // ~one trading year
};

export interface Candle {
  /** Epoch seconds (UTC) of the bar open. */
  readonly time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  /** Absent for indexes (no traded volume). */
  readonly volume?: number;
}

export interface CandleSeries {
  readonly instrumentKey: InstrumentKey;
  readonly interval: CandleInterval;
  readonly candles: readonly Candle[];
  readonly source: 'live' | 'snapshot' | 'simulated';
}
