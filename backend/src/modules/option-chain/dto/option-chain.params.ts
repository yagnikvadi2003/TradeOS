import { z } from 'zod';
import { INSTRUMENT_KEY_PATTERN, ISO_DATE_PATTERN } from '@/common/market/market-primitives';

/** `:instrument` path parameter — a TradeOS instrument key, never a provider symbol. */
export const instrumentParamSchema = z.object({
  instrument: z
    .string()
    .trim()
    .toUpperCase()
    .regex(INSTRUMENT_KEY_PATTERN, 'instrument must look like NSE:INDEX:NIFTY50'),
});
export type InstrumentParam = z.infer<typeof instrumentParamSchema>;

export const snapshotQuerySchema = z.object({
  expiry: z
    .string()
    .trim()
    .regex(ISO_DATE_PATTERN, 'expiry must be YYYY-MM-DD')
    .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'expiry is not a calendar date')
    .optional(),
});
export type SnapshotQuery = z.infer<typeof snapshotQuerySchema>;
