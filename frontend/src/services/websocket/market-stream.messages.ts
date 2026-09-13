import { z } from 'zod';
import { type ExchangeCode, type InstrumentKey } from '@/features/market/domain';
import {
  type IsoDate,
  type OptionContractKey,
  type OptionGreeks,
  type OptionType,
} from '@/features/option-chain/domain';
import { type ProviderConnectionState } from './connection-state';

/**
 * `/ws/market` v1 contract as seen by the browser. Server frames are
 * validated with Zod before they touch any store; the shapes are TradeOS
 * domain shapes and never resemble a provider payload.
 */
export type MarketDataSource = 'live' | 'snapshot' | 'simulated';

export interface IndexTick {
  readonly kind: 'index';
  readonly instrumentKey: InstrumentKey;
  readonly timestamp: number;
  readonly receivedAt: number;
  readonly ltp: number | null;
  readonly previousClose: number | null;
  readonly open: number | null;
  readonly high: number | null;
  readonly low: number | null;
  readonly change: number | null;
  readonly changePercent: number | null;
  readonly volume: number | null;
  readonly source: MarketDataSource;
}

export interface OptionTick {
  readonly kind: 'option';
  readonly contractKey: OptionContractKey;
  readonly underlyingKey: InstrumentKey;
  readonly exchangeCode: ExchangeCode;
  readonly expiryDate: IsoDate;
  readonly strike: number;
  readonly optionType: OptionType;
  readonly timestamp: number;
  readonly receivedAt: number;
  readonly ltp: number | null;
  readonly previousClose: number | null;
  readonly change: number | null;
  readonly changePercent: number | null;
  readonly volume: number | null;
  readonly openInterest: number | null;
  readonly openInterestChange: number | null;
  readonly impliedVolatility: number | null;
  readonly bid: number | null;
  readonly ask: number | null;
  readonly bidQuantity: number | null;
  readonly askQuantity: number | null;
  readonly greeks: OptionGreeks | null;
  readonly source: MarketDataSource;
}

export type MarketUpdate = IndexTick | OptionTick;
export type StreamKey = string;

export function streamKeyOf(update: MarketUpdate): StreamKey {
  return update.kind === 'index' ? update.instrumentKey : update.contractKey;
}

const num = z.number().finite();
const nullableNum = num.nullable();
const source = z.enum(['live', 'snapshot', 'simulated']);

const indexTickSchema = z.object({
  kind: z.literal('index'),
  instrumentKey: z.string(),
  timestamp: num,
  receivedAt: num,
  ltp: nullableNum,
  previousClose: nullableNum,
  open: nullableNum,
  high: nullableNum,
  low: nullableNum,
  change: nullableNum,
  changePercent: nullableNum,
  volume: nullableNum,
  source,
});

const optionTickSchema = z.object({
  kind: z.literal('option'),
  contractKey: z.string(),
  underlyingKey: z.string(),
  exchangeCode: z.enum(['NSE', 'BSE']),
  expiryDate: z.string(),
  strike: num,
  optionType: z.enum(['CE', 'PE']),
  timestamp: num,
  receivedAt: num,
  ltp: nullableNum,
  previousClose: nullableNum,
  change: nullableNum,
  changePercent: nullableNum,
  volume: nullableNum,
  openInterest: nullableNum,
  openInterestChange: nullableNum,
  impliedVolatility: nullableNum,
  bid: nullableNum,
  ask: nullableNum,
  bidQuantity: nullableNum,
  askQuantity: nullableNum,
  greeks: z
    .object({ delta: num, gamma: num, theta: num, vega: num, rho: num.optional() })
    .nullable(),
  source,
});

export const marketUpdateSchema = z.discriminatedUnion('kind', [indexTickSchema, optionTickSchema]);

const providerState = z.enum([
  'DISCONNECTED',
  'CONNECTING',
  'AUTHENTICATING',
  'CONNECTED',
  'DEGRADED',
  'RECONNECTING',
  'STOPPING',
]);

export const serverMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('auth'), ok: z.literal(true), sessionId: z.string(), expiresAt: num }),
  z.object({
    type: z.literal('subscribe'),
    ok: z.literal(true),
    instruments: z.array(z.string()),
    rejected: z.array(z.string()),
  }),
  z.object({
    type: z.literal('unsubscribe'),
    ok: z.literal(true),
    instruments: z.array(z.string()),
  }),
  z.object({ type: z.literal('snapshot'), updates: z.array(marketUpdateSchema) }),
  z.object({
    type: z.literal('delta'),
    updates: z.array(marketUpdateSchema),
    dropped: num.optional(),
  }),
  z.object({ type: z.literal('heartbeat'), serverTime: num, sentAt: num.optional() }),
  z.object({ type: z.literal('connection_status'), provider: providerState, stale: z.boolean() }),
  z.object({
    type: z.literal('notification'),
    id: z.string(),
    alertId: z.string().nullable(),
    title: z.string(),
    body: z.string(),
    value: num.nullable(),
    createdAt: num,
  }),
  z.object({
    type: z.literal('error'),
    code: z.string(),
    message: z.string(),
    fatal: z.boolean().optional(),
  }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;

export type ClientMessage =
  | { readonly type: 'auth'; readonly token: string }
  | { readonly type: 'subscribe'; readonly instruments: readonly StreamKey[] }
  | { readonly type: 'unsubscribe'; readonly instruments: readonly StreamKey[] }
  | { readonly type: 'heartbeat'; readonly sentAt: number };

export type { ProviderConnectionState };
