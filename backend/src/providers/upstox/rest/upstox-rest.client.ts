import { z } from 'zod';
import {
  ProviderPayloadInvalidError,
  ProviderUnavailableError,
} from '@/common/errors/domain-error';
import { UpstoxAuthError } from '../websocket/upstox-feed.transport';

/**
 * Typed wrapper over the Upstox REST endpoints the adapter needs. Every
 * response is validated with a tolerant schema (unknown fields ignored,
 * missing numbers become undefined) so a contract change surfaces as
 * PROVIDER_PAYLOAD_INVALID rather than NaN in the domain.
 *
 * Endpoints (verified against developer docs, 2026-09-09):
 *   GET /v2/option/contract?instrument_key=&expiry_date=   — contracts of an underlying
 *   GET /v2/option/chain?instrument_key=&expiry_date=      — chain with market data + greeks
 *   GET /v3/market-quote/ohlc?instrument_key=&interval=1d  — index level with day OHLC
 *   GET /v3/historical-candle/{key}/{unit}/{interval}/{to}/{from} — history (oldest→newest after sort)
 *   GET /v3/historical-candle/intraday/{key}/{unit}/{interval}  — current session
 */
const num = z.number().finite();
const optNum = num.optional();

export const upstoxContractSchema = z.object({
  segment: z.string(),
  exchange: z.enum(['NSE', 'BSE', 'MCX']),
  expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  instrument_key: z.string().min(3),
  trading_symbol: z.string().min(1),
  tick_size: num.positive(),
  lot_size: z.number().int().positive(),
  instrument_type: z.enum(['CE', 'PE']),
  underlying_key: z.string().min(3),
  strike_price: num.positive(),
  weekly: z.boolean().optional(),
});
export type UpstoxContract = z.infer<typeof upstoxContractSchema>;

const chainLegSchema = z.object({
  instrument_key: z.string().min(3),
  market_data: z
    .object({
      ltp: optNum,
      volume: optNum,
      oi: optNum,
      close_price: optNum,
      bid_price: optNum,
      bid_qty: optNum,
      ask_price: optNum,
      ask_qty: optNum,
      prev_oi: optNum,
    })
    .optional(),
  option_greeks: z
    .object({
      vega: optNum,
      theta: optNum,
      gamma: optNum,
      delta: optNum,
      /** Percent (e.g. 14.2). */
      iv: optNum,
    })
    .optional(),
});
export const upstoxChainRowSchema = z.object({
  expiry: z.string(),
  strike_price: num,
  underlying_spot_price: optNum,
  call_options: chainLegSchema.optional(),
  put_options: chainLegSchema.optional(),
});
export type UpstoxChainRow = z.infer<typeof upstoxChainRowSchema>;
export type UpstoxChainLeg = z.infer<typeof chainLegSchema>;

const ohlcSchema = z.object({ open: optNum, high: optNum, low: optNum, close: optNum });
export const upstoxOhlcQuoteSchema = z.object({
  last_price: optNum,
  live_ohlc: ohlcSchema.optional(),
  prev_ohlc: ohlcSchema.optional(),
});
export type UpstoxOhlcQuote = z.infer<typeof upstoxOhlcQuoteSchema>;

/** `[timestamp ISO+05:30, open, high, low, close, volume, oi]` */
export const upstoxCandleRowSchema = z
  .tuple([z.string(), num, num, num, num, num, num])
  .rest(z.unknown());
export type UpstoxCandleRow = z.infer<typeof upstoxCandleRowSchema>;

export class UpstoxRestClient {
  constructor(
    private readonly apiBaseUrl: string,
    private readonly accessToken: () => Promise<string | undefined>,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async getOptionContracts(underlyingKey: string, expiryDate?: string): Promise<UpstoxContract[]> {
    const params = new URLSearchParams({ instrument_key: underlyingKey });
    if (expiryDate) params.set('expiry_date', expiryDate);
    const data = await this.get(`/v2/option/contract?${params.toString()}`);
    return this.validate(z.array(upstoxContractSchema), data, 'option/contract');
  }

  async getOptionChain(underlyingKey: string, expiryDate: string): Promise<UpstoxChainRow[]> {
    const params = new URLSearchParams({ instrument_key: underlyingKey, expiry_date: expiryDate });
    const data = await this.get(`/v2/option/chain?${params.toString()}`);
    return this.validate(z.array(upstoxChainRowSchema), data, 'option/chain');
  }

  /** Returns the quote keyed by the response's own key (`NSE_INDEX:Nifty 50` — colon, not pipe). */
  async getOhlcQuote(instrumentKey: string): Promise<UpstoxOhlcQuote | null> {
    const params = new URLSearchParams({ instrument_key: instrumentKey, interval: '1d' });
    const data = await this.get(`/v3/market-quote/ohlc?${params.toString()}`);
    const record = this.validate(
      z.record(z.string(), upstoxOhlcQuoteSchema),
      data,
      'market-quote/ohlc',
    );
    const expected = instrumentKey.replace('|', ':');
    return record[expected] ?? Object.values(record)[0] ?? null;
  }

  async getHistoricalCandles(
    instrumentKey: string,
    unit: 'minutes' | 'hours' | 'days',
    interval: number,
    toDate: string,
    fromDate: string,
  ): Promise<UpstoxCandleRow[]> {
    const data = await this.get(
      `/v3/historical-candle/${encodeURIComponent(instrumentKey)}/${unit}/${interval}/${toDate}/${fromDate}`,
    );
    return this.validate(
      z.object({ candles: z.array(upstoxCandleRowSchema) }),
      data,
      'historical-candle',
    ).candles;
  }

  async getIntradayCandles(
    instrumentKey: string,
    unit: 'minutes' | 'hours',
    interval: number,
  ): Promise<UpstoxCandleRow[]> {
    const data = await this.get(
      `/v3/historical-candle/intraday/${encodeURIComponent(instrumentKey)}/${unit}/${interval}`,
    );
    return this.validate(
      z.object({ candles: z.array(upstoxCandleRowSchema) }),
      data,
      'intraday-candle',
    ).candles;
  }

  private async get(path: string): Promise<unknown> {
    const token = await this.accessToken();
    if (!token) throw new UpstoxAuthError(401);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.apiBaseUrl}${path}`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      });
    } catch (error) {
      throw new ProviderUnavailableError('upstox', error);
    }
    if (response.status === 401 || response.status === 403)
      throw new UpstoxAuthError(response.status);
    if (!response.ok) {
      throw new ProviderUnavailableError(
        'upstox',
        new Error(`${path.split('?')[0]} HTTP ${response.status}`),
      );
    }
    const body = (await response.json()) as { status?: string; data?: unknown };
    if (body.status !== 'success') {
      throw new ProviderPayloadInvalidError('upstox', `status=${String(body.status)}`);
    }
    return body.data;
  }

  private validate<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw new ProviderPayloadInvalidError(
        'upstox',
        `${what}: ${parsed.error.issues[0]?.message ?? 'invalid'}`,
      );
    }
    return parsed.data;
  }
}
