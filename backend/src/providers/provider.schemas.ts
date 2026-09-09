import { z } from 'zod';
import {
  EXPIRY_CYCLES,
  INSTRUMENT_KEY_PATTERN,
  ISO_DATE_PATTERN,
  OPTION_CONTRACT_KEY_PATTERN,
  OPTION_TYPES,
} from '@/common/market/market-primitives';
import {
  type OptionContract,
  type OptionMarketData,
  type UnderlyingMarketData,
} from '@/modules/option-chain/domain';
import { type ProviderExpiry } from './provider.interface';

/**
 * Schemas for the *normalized* provider outputs. The option-chain service
 * re-validates whatever an adapter returns so a buggy or malicious adapter
 * can never push NaN, negative OI or malformed keys into the domain.
 */
const finite = z.number().finite();
const nonNegative = finite.nonnegative();
const nullableFinite = finite.nullable();
const nullableNonNegative = nonNegative.nullable();
const epochMs = z.number().int().nonnegative();

export const providerExpirySchema = z
  .object({
    expiryDate: z.string().regex(ISO_DATE_PATTERN),
    cycle: z.enum(EXPIRY_CYCLES),
  })
  .transform((v): ProviderExpiry => v);

export const providerOptionContractSchema = z
  .object({
    contractKey: z.string().regex(OPTION_CONTRACT_KEY_PATTERN),
    underlyingKey: z.string().regex(INSTRUMENT_KEY_PATTERN),
    exchangeCode: z.enum(['NSE', 'BSE']),
    tradingSymbol: z.string().min(1).max(64),
    expiryDate: z.string().regex(ISO_DATE_PATTERN),
    strike: finite.positive(),
    optionType: z.enum(OPTION_TYPES),
    lotSize: z.number().int().positive(),
    tickSize: finite.positive(),
  })
  .transform((v): OptionContract => v as OptionContract);

export const providerGreeksSchema = z.object({
  delta: finite.min(-1).max(1),
  gamma: nonNegative,
  theta: finite,
  vega: nonNegative,
  rho: finite.optional(),
});

export const providerOptionMarketDataSchema = z
  .object({
    contractKey: z.string().regex(OPTION_CONTRACT_KEY_PATTERN),
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
    greeks: providerGreeksSchema.nullable(),
    updatedAt: epochMs,
    source: z.enum(['live', 'snapshot', 'simulated']),
  })
  .transform((v): OptionMarketData => v as OptionMarketData);

export const providerUnderlyingSchema = z
  .object({
    instrumentKey: z.string().regex(INSTRUMENT_KEY_PATTERN),
    ltp: finite.positive(),
    previousClose: finite.positive(),
    open: finite.positive(),
    high: finite.positive(),
    low: finite.positive(),
    change: finite,
    changePercent: finite,
    updatedAt: epochMs,
    source: z.enum(['live', 'snapshot', 'simulated']),
  })
  .transform((v): UnderlyingMarketData => v as UnderlyingMarketData);
