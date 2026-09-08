import { z } from 'zod';

/**
 * Versioned REST contracts (v1). These mirror the backend's public DTOs and
 * deliberately do not resemble any provider payload.
 */
const instrumentKeySchema = z
  .string()
  .regex(/^(NSE|BSE):INDEX:[A-Z0-9]+$/, 'Malformed instrumentKey');

export const indexQuoteDtoSchema = z.object({
  instrumentKey: instrumentKeySchema,
  ltp: z.number().finite(),
  previousClose: z.number().finite(),
  open: z.number().finite(),
  high: z.number().finite(),
  low: z.number().finite(),
  change: z.number().finite(),
  changePercent: z.number().finite(),
  updatedAt: z.number().int().nonnegative(),
  source: z.enum(['live', 'snapshot']),
});

export const indexQuotesResponseSchema = z.object({
  data: z.array(indexQuoteDtoSchema),
});

export const candleDtoSchema = z.object({
  time: z.number().int().nonnegative(),
  open: z.number().finite(),
  high: z.number().finite(),
  low: z.number().finite(),
  close: z.number().finite(),
  volume: z.number().nonnegative().optional(),
});

export const candlesResponseSchema = z.object({
  data: z.object({
    instrumentKey: instrumentKeySchema,
    interval: z.enum(['1m', '5m', '15m', '1h', '1d']),
    candles: z.array(candleDtoSchema),
  }),
});

export type IndexQuoteDto = z.infer<typeof indexQuoteDtoSchema>;
export type CandlesResponseDto = z.infer<typeof candlesResponseSchema>;
