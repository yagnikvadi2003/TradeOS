import { z } from 'zod';
import { INSTRUMENT_KEY_PATTERN } from '@/common/market/market-primitives';
import { CANDLE_INTERVALS } from '../domain/candle';

export const chartInstrumentParamSchema = z.object({
  instrument: z.string().regex(INSTRUMENT_KEY_PATTERN, 'TradeOS instrument key expected'),
});
export const candlesQuerySchema = z.object({
  interval: z.enum(CANDLE_INTERVALS).default('5m'),
  /** Upper bound on bars returned (newest kept). */
  limit: z.coerce.number().int().min(10).max(2_000).optional(),
});
export type CandlesQuery = z.infer<typeof candlesQuerySchema>;

export const candleDtoSchema = z.object({
  time: z.number().int().nonnegative().describe('Epoch seconds (UTC) of the bar open'),
  open: z.number().finite(),
  high: z.number().finite(),
  low: z.number().finite(),
  close: z.number().finite(),
  volume: z.number().nonnegative().optional(),
});
export const candlesResponseSchema = z.object({
  data: z.object({
    instrumentKey: z.string(),
    interval: z.enum(CANDLE_INTERVALS),
    candles: z.array(candleDtoSchema),
    source: z.enum(['live', 'snapshot', 'simulated']),
  }),
  meta: z.object({ version: z.literal('v1'), generatedAt: z.number().int() }),
});
export type CandlesResponse = z.infer<typeof candlesResponseSchema>;
