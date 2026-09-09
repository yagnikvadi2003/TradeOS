import { z } from 'zod';
import {
  EXPIRY_CYCLES,
  INSTRUMENT_KEY_PATTERN,
  ISO_DATE_PATTERN,
  OPTION_CONTRACT_KEY_PATTERN,
  OPTION_TYPES,
} from '@/common/market/market-primitives';

/**
 * Versioned (v1) REST response contracts, declared as Zod schemas so they
 * serve three purposes: the mapper's target type, the OpenAPI document, and
 * the shape the frontend validates against. Provider payloads never appear here.
 */
const finite = z.number().finite();
const nullableFinite = finite.nullable();
const epochMs = z.number().int().nonnegative();
const source = z.enum(['live', 'snapshot', 'simulated']);

export const expiryDtoSchema = z.object({
  instrumentKey: z.string().regex(INSTRUMENT_KEY_PATTERN),
  expiryDate: z.string().regex(ISO_DATE_PATTERN),
  cycle: z.enum(EXPIRY_CYCLES),
  daysToExpiry: z.number().int(),
});

export const optionContractDtoSchema = z.object({
  contractKey: z.string().regex(OPTION_CONTRACT_KEY_PATTERN),
  underlyingKey: z.string().regex(INSTRUMENT_KEY_PATTERN),
  exchangeCode: z.enum(['NSE', 'BSE']),
  tradingSymbol: z.string(),
  expiryDate: z.string().regex(ISO_DATE_PATTERN),
  strike: finite,
  optionType: z.enum(OPTION_TYPES),
  lotSize: z.number().int().positive(),
  tickSize: finite.positive(),
});

export const optionGreeksDtoSchema = z.object({
  delta: finite,
  gamma: finite,
  theta: finite,
  vega: finite,
  rho: finite.optional(),
});

export const optionMarketDataDtoSchema = z.object({
  ltp: nullableFinite,
  previousClose: nullableFinite,
  change: nullableFinite,
  changePercent: nullableFinite,
  volume: nullableFinite,
  openInterest: nullableFinite,
  openInterestChange: nullableFinite,
  impliedVolatility: nullableFinite,
  bid: nullableFinite,
  ask: nullableFinite,
  bidQuantity: nullableFinite,
  askQuantity: nullableFinite,
  greeks: optionGreeksDtoSchema.nullable(),
  intrinsic: finite,
  extrinsic: nullableFinite,
  updatedAt: epochMs,
});

export const optionLegDtoSchema = z.object({
  contract: optionContractDtoSchema,
  market: optionMarketDataDtoSchema,
});

export const optionStrikeDtoSchema = z.object({
  strike: finite,
  isAtm: z.boolean(),
  stepsFromAtm: z.number().int(),
  ce: optionLegDtoSchema.nullable(),
  pe: optionLegDtoSchema.nullable(),
});

export const underlyingMarketDataDtoSchema = z.object({
  instrumentKey: z.string().regex(INSTRUMENT_KEY_PATTERN),
  ltp: finite,
  previousClose: finite,
  open: finite,
  high: finite,
  low: finite,
  change: finite,
  changePercent: finite,
  updatedAt: epochMs,
  source,
});

export const optionChainSnapshotDtoSchema = z.object({
  instrumentKey: z.string().regex(INSTRUMENT_KEY_PATTERN),
  expiry: expiryDtoSchema,
  underlying: underlyingMarketDataDtoSchema,
  atmStrike: finite,
  strikeStep: finite.positive(),
  lotSize: z.number().int().positive(),
  strikes: z.array(optionStrikeDtoSchema),
  totals: z.object({
    ceOpenInterest: finite,
    peOpenInterest: finite,
    ceVolume: finite,
    peVolume: finite,
    putCallRatio: nullableFinite,
  }),
  asOf: epochMs,
  oldestUpdateAt: epochMs,
  source,
});

export const optionChainMetadataDtoSchema = z.object({
  instrumentKey: z.string().regex(INSTRUMENT_KEY_PATTERN),
  symbol: z.string(),
  name: z.string(),
  strikeStep: finite.positive(),
  lotSize: z.number().int().positive(),
  expiries: z.array(expiryDtoSchema),
  nearestExpiry: z.string().regex(ISO_DATE_PATTERN).nullable(),
});

export const responseMetaSchema = z.object({
  version: z.literal('v1'),
  generatedAt: epochMs,
});

export function envelope<T extends z.ZodType>(data: T) {
  return z.object({ data, meta: responseMetaSchema });
}

export const expiriesResponseSchema = envelope(z.array(expiryDtoSchema));
export const snapshotResponseSchema = envelope(optionChainSnapshotDtoSchema);
export const metadataResponseSchema = envelope(optionChainMetadataDtoSchema);

export type ExpiryDto = z.infer<typeof expiryDtoSchema>;
export type OptionContractDto = z.infer<typeof optionContractDtoSchema>;
export type OptionMarketDataDto = z.infer<typeof optionMarketDataDtoSchema>;
export type OptionLegDto = z.infer<typeof optionLegDtoSchema>;
export type OptionStrikeDto = z.infer<typeof optionStrikeDtoSchema>;
export type OptionChainSnapshotDto = z.infer<typeof optionChainSnapshotDtoSchema>;
export type OptionChainMetadataDto = z.infer<typeof optionChainMetadataDtoSchema>;
export type ResponseMeta = z.infer<typeof responseMetaSchema>;
export type ExpiriesResponse = z.infer<typeof expiriesResponseSchema>;
export type SnapshotResponse = z.infer<typeof snapshotResponseSchema>;
export type MetadataResponse = z.infer<typeof metadataResponseSchema>;
