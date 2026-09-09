import { z } from 'zod';

/**
 * v1 option-chain response contracts. Mirrors
 * `backend/src/modules/option-chain/dto/option-chain.response.ts`; keep the
 * two in step when the contract changes.
 */
const instrumentKey = z.string().regex(/^(NSE|BSE):INDEX:[A-Z0-9]+$/, 'Malformed instrumentKey');
const contractKey = z
  .string()
  .regex(
    /^(NSE|BSE):OPT:[A-Z0-9]+:\d{4}-\d{2}-\d{2}:\d+(\.\d+)?:(CE|PE)$/,
    'Malformed contractKey',
  );
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Malformed date');
const finite = z.number().finite();
const nullableFinite = finite.nullable();
const epochMs = z.number().int().nonnegative();
const source = z.enum(['live', 'snapshot', 'simulated']);

export const expiryDtoSchema = z.object({
  instrumentKey,
  expiryDate: isoDate,
  cycle: z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY']),
  daysToExpiry: z.number().int(),
});

const optionContractDtoSchema = z.object({
  contractKey,
  underlyingKey: instrumentKey,
  exchangeCode: z.enum(['NSE', 'BSE']),
  tradingSymbol: z.string(),
  expiryDate: isoDate,
  strike: finite,
  optionType: z.enum(['CE', 'PE']),
  lotSize: z.number().int().positive(),
  tickSize: finite.positive(),
});

const optionMarketDataDtoSchema = z.object({
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
  greeks: z
    .object({ delta: finite, gamma: finite, theta: finite, vega: finite, rho: finite.optional() })
    .nullable(),
  intrinsic: finite,
  extrinsic: nullableFinite,
  updatedAt: epochMs,
});

const optionLegDtoSchema = z.object({
  contract: optionContractDtoSchema,
  market: optionMarketDataDtoSchema,
});

export const optionChainSnapshotDtoSchema = z.object({
  instrumentKey,
  expiry: expiryDtoSchema,
  underlying: z.object({
    instrumentKey,
    ltp: finite,
    previousClose: finite,
    open: finite,
    high: finite,
    low: finite,
    change: finite,
    changePercent: finite,
    updatedAt: epochMs,
    source,
  }),
  atmStrike: finite,
  strikeStep: finite.positive(),
  lotSize: z.number().int().positive(),
  strikes: z.array(
    z.object({
      strike: finite,
      isAtm: z.boolean(),
      stepsFromAtm: z.number().int(),
      ce: optionLegDtoSchema.nullable(),
      pe: optionLegDtoSchema.nullable(),
    }),
  ),
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
  instrumentKey,
  symbol: z.string(),
  name: z.string(),
  strikeStep: finite.positive(),
  lotSize: z.number().int().positive(),
  expiries: z.array(expiryDtoSchema),
  nearestExpiry: isoDate.nullable(),
});

const meta = z.object({ version: z.literal('v1'), generatedAt: epochMs });

export const expiriesResponseSchema = z.object({ data: z.array(expiryDtoSchema), meta });
export const snapshotResponseSchema = z.object({ data: optionChainSnapshotDtoSchema, meta });
export const metadataResponseSchema = z.object({ data: optionChainMetadataDtoSchema, meta });

export type OptionChainSnapshotDto = z.infer<typeof optionChainSnapshotDtoSchema>;
export type OptionChainMetadataDto = z.infer<typeof optionChainMetadataDtoSchema>;
