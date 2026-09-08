import { type InstrumentKey } from '@/features/market/domain';

export const CANDLE_INTERVALS = ['1m', '5m', '15m', '1h', '1d'] as const;
export type CandleInterval = (typeof CANDLE_INTERVALS)[number];

export const CANDLE_INTERVAL_SECONDS: Record<CandleInterval, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '1d': 86_400,
};

export interface Candle {
  /** Epoch seconds (UTC) of the bar open — the unit Lightweight Charts expects. */
  readonly time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume?: number;
}

export interface CandleSeries {
  readonly instrumentKey: InstrumentKey;
  readonly interval: CandleInterval;
  readonly candles: readonly Candle[];
}
