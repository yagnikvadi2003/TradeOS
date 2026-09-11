import { z } from 'zod';
import {
  INSTRUMENT_KEY_PATTERN,
  OPTION_CONTRACT_KEY_PATTERN,
} from '@/common/market/market-primitives';

/** Boundary validation for anything a feed adapter emits. */
const finite = z.number().finite();
const nullableFinite = finite.nullable();
const nullableNonNegative = finite.nonnegative().nullable();
const epochMs = z.number().int().nonnegative();
const source = z.enum(['live', 'snapshot', 'simulated']);

export const indexTickSchema = z.object({
  kind: z.literal('index'),
  instrumentKey: z.string().regex(INSTRUMENT_KEY_PATTERN),
  timestamp: epochMs,
  receivedAt: epochMs,
  ltp: finite.positive().nullable(),
  previousClose: finite.positive().nullable(),
  open: nullableNonNegative,
  high: nullableNonNegative,
  low: nullableNonNegative,
  change: nullableFinite,
  changePercent: nullableFinite,
  volume: nullableNonNegative,
  source,
});

export const optionTickSchema = z.object({
  kind: z.literal('option'),
  contractKey: z.string().regex(OPTION_CONTRACT_KEY_PATTERN),
  underlyingKey: z.string().regex(INSTRUMENT_KEY_PATTERN),
  exchangeCode: z.enum(['NSE', 'BSE']),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  strike: finite.positive(),
  optionType: z.enum(['CE', 'PE']),
  timestamp: epochMs,
  receivedAt: epochMs,
  ltp: nullableNonNegative,
  previousClose: nullableNonNegative,
  change: nullableFinite,
  changePercent: nullableFinite,
  volume: nullableNonNegative,
  openInterest: nullableNonNegative,
  openInterestChange: nullableFinite,
  impliedVolatility: nullableNonNegative,
  bid: nullableNonNegative,
  ask: nullableNonNegative,
  bidQuantity: nullableNonNegative,
  askQuantity: nullableNonNegative,
  greeks: z
    .object({
      delta: finite.min(-1).max(1),
      gamma: finite,
      theta: finite,
      vega: finite,
      rho: finite.optional(),
    })
    .nullable(),
  source,
});

export const marketUpdateSchema = z.discriminatedUnion('kind', [indexTickSchema, optionTickSchema]);
