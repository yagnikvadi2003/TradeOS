import { Injectable } from '@nestjs/common';
import {
  buildOptionContractKey,
  type InstrumentKey,
  type IsoDate,
  isoDateToUtcDate,
  istIsoDate,
  istSessionCloseMs,
  type OptionContractKey,
  type OptionType,
  parseInstrumentKey,
  parseOptionContractKey,
  toIsoDate,
} from '@/common/market/market-primitives';
import {
  InstrumentNotFoundError,
  OptionChainNotSupportedError,
} from '@/common/errors/domain-error';
import { catalogInstrument } from '@/modules/instruments/instrument.catalog';
import {
  CANDLE_INTERVAL_SECONDS,
  type CandleInterval,
  type CandleSeries,
} from '@/modules/charts/domain/candle';
import { type InstrumentDefinition } from '@/modules/instruments/instrument-definition';
import {
  type OptionContract,
  type OptionMarketData,
  type UnderlyingMarketData,
} from '@/modules/option-chain/domain';
import {
  type MarketDataProvider,
  type MarketDataProviderName,
  type ProviderExpiry,
} from '../provider.interface';
import { blackScholes } from './black-scholes';
import { hashSeed, prng, roundTo, roundToTick } from './deterministic';

/**
 * Deterministic simulated market data — development and tests ONLY.
 *
 * - Refused in production by `loadEnv`.
 * - Every value is tagged `source: 'simulated'`; nothing here is a market feed.
 * - Output is a pure function of (instrument, expiry, time bucket): the same
 *   inputs within one bucket always return identical data, so tests are
 *   stable and a request burst does not fabricate "ticks".
 * - Prices, IV and Greeks are internally consistent (Black–Scholes) so the
 *   UI exercises the same code paths a real feed will.
 */

export interface MockProviderOptions {
  /** Injected clock (epoch ms). */
  readonly now?: () => number;
  /** Time bucket that keeps quotes stable between calls. */
  readonly bucketMs?: number;
  /** Strike steps generated on each side of the anchor. */
  readonly strikesEachSide?: number;
  /** When set, every call rejects — exercises provider-unavailable paths. */
  readonly failWith?: Error;
}

interface ExpiryProfile {
  /** ISO weekday (1 = Mon … 7 = Sun) on which contracts expire. */
  readonly weekday: number;
  readonly weeklyCount: number;
  readonly monthlyCount: number;
}

/** Order-of-magnitude anchors and listing profiles. Not prices. */
const MOCK_INSTRUMENTS: Record<string, { anchor: number; baseIv: number; profile: ExpiryProfile }> =
  {
    'NSE:INDEX:NIFTY50': {
      anchor: 24_000,
      baseIv: 0.13,
      profile: { weekday: 2, weeklyCount: 4, monthlyCount: 3 },
    },
    'NSE:INDEX:BANKNIFTY': {
      anchor: 52_000,
      baseIv: 0.16,
      profile: { weekday: 2, weeklyCount: 0, monthlyCount: 3 },
    },
    'NSE:INDEX:FINNIFTY': {
      anchor: 24_500,
      baseIv: 0.15,
      profile: { weekday: 2, weeklyCount: 0, monthlyCount: 3 },
    },
    'BSE:INDEX:SENSEX': {
      anchor: 79_000,
      baseIv: 0.13,
      profile: { weekday: 4, weeklyCount: 4, monthlyCount: 3 },
    },
    'BSE:INDEX:BANKEX': {
      anchor: 58_000,
      baseIv: 0.16,
      profile: { weekday: 4, weeklyCount: 0, monthlyCount: 3 },
    },
  };

const RISK_FREE_RATE = 0.065;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const MIN_T_YEARS = 1 / (365 * 24); // one hour floor so d1 stays finite on expiry day
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

@Injectable()
export class MockMarketDataProvider implements MarketDataProvider {
  readonly name: MarketDataProviderName = 'mock';
  readonly dataSource = 'simulated' as const;

  private readonly now: () => number;
  private readonly bucketMs: number;
  private readonly strikesEachSide: number;
  private readonly failWith: Error | undefined;

  constructor(options: MockProviderOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.bucketMs = options.bucketMs ?? 2_000;
    this.strikesEachSide = options.strikesEachSide ?? 40;
    this.failWith = options.failWith;
  }

  private guard(): void {
    if (this.failWith) throw this.failWith;
  }

  private bucket(): number {
    const now = this.now();
    return now - (now % this.bucketMs);
  }

  private optionInstrument(key: InstrumentKey): InstrumentDefinition {
    const definition = catalogInstrument(key);
    if (!definition) throw new InstrumentNotFoundError(key);
    if (!definition.hasOptionChain || !MOCK_INSTRUMENTS[key]) {
      throw new OptionChainNotSupportedError(key);
    }
    return definition;
  }

  async listExpiries(instrumentKey: InstrumentKey): Promise<readonly ProviderExpiry[]> {
    this.guard();
    this.optionInstrument(instrumentKey);
    const config = MOCK_INSTRUMENTS[instrumentKey]!;
    const nowMs = this.now();
    const today = istIsoDate(nowMs);
    // Expiry day counts until the session closes; afterwards roll to the next one.
    const firstEligible = nowMs < istSessionCloseMs(today) ? today : addDays(today, 1);

    const dates = new Map<IsoDate, ProviderExpiry['cycle']>();
    let cursor = nextWeekday(firstEligible, config.profile.weekday);
    for (let i = 0; i < config.profile.weeklyCount; i += 1) {
      dates.set(cursor, 'WEEKLY');
      cursor = addDays(cursor, 7);
    }
    let month = firstEligible.slice(0, 7);
    let added = 0;
    while (added < config.profile.monthlyCount) {
      const last = lastWeekdayOfMonth(month, config.profile.weekday);
      if (last >= firstEligible) {
        dates.set(last, 'MONTHLY');
        added += 1;
      }
      month = nextMonth(month);
    }
    return [...dates.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([expiryDate, cycle]) => ({ expiryDate, cycle }));
  }

  async listOptionContracts(
    instrumentKey: InstrumentKey,
    expiryDate: IsoDate,
  ): Promise<readonly OptionContract[]> {
    this.guard();
    const definition = this.optionInstrument(instrumentKey);
    const config = MOCK_INSTRUMENTS[instrumentKey]!;
    const step = definition.strikeStep!;
    const lotSize = definition.lotSize!;
    const centre = Math.round(config.anchor / step) * step;
    const contracts: OptionContract[] = [];
    for (let i = -this.strikesEachSide; i <= this.strikesEachSide; i += 1) {
      const strike = centre + i * step;
      for (const optionType of ['CE', 'PE'] as const) {
        contracts.push({
          contractKey: buildOptionContractKey(
            definition.exchangeCode,
            definition.symbol,
            expiryDate,
            strike,
            optionType,
          ),
          underlyingKey: instrumentKey,
          exchangeCode: definition.exchangeCode,
          tradingSymbol: tradingSymbol(definition.symbol, expiryDate, strike, optionType),
          expiryDate,
          strike,
          optionType,
          lotSize,
          tickSize: definition.tickSize,
        });
      }
    }
    return contracts;
  }

  /**
   * Deterministic random-walk bars ending at the current bar. Seeded per
   * (instrument, interval, last bar), so the series is stable within a bar
   * and consistent with the simulated underlying level.
   */
  async getCandles(
    instrumentKey: InstrumentKey,
    interval: CandleInterval,
    count: number,
  ): Promise<CandleSeries> {
    this.guard();
    const definition = catalogInstrument(instrumentKey);
    if (!definition) throw new InstrumentNotFoundError(instrumentKey);
    const step = CANDLE_INTERVAL_SECONDS[interval];
    const nowSec = Math.floor(this.now() / 1000);
    const lastBar = nowSec - (nowSec % step);
    const rand = prng(hashSeed(`${instrumentKey}|candles|${interval}|${lastBar}`));
    const anchor =
      MOCK_INSTRUMENTS[instrumentKey]?.anchor ??
      (definition.kind === 'VOLATILITY_INDEX' ? 14 : 1_000);
    const decimals = definition.tickSize < 0.01 ? 4 : 2;
    const volatility =
      (definition.kind === 'VOLATILITY_INDEX' ? 0.08 : 0.012) * Math.sqrt(step / 86_400);
    const candles = [];
    let close = anchor * (0.97 + rand() * 0.06);
    for (let i = count - 1; i >= 0; i -= 1) {
      const open = close;
      close = roundTo(open * (1 + (rand() - 0.5) * 2 * volatility), decimals);
      const wick = rand() * volatility * open;
      candles.push({
        time: lastBar - i * step,
        open: roundTo(open, decimals),
        high: roundTo(Math.max(open, close) + wick, decimals),
        low: roundTo(Math.min(open, close) - wick, decimals),
        close,
      });
    }
    return { instrumentKey, interval, candles, source: 'simulated' };
  }

  async getUnderlyingQuote(instrumentKey: InstrumentKey): Promise<UnderlyingMarketData> {
    this.guard();
    const definition = catalogInstrument(instrumentKey);
    if (!definition) throw new InstrumentNotFoundError(instrumentKey);
    return this.underlying(instrumentKey, definition, this.bucket());
  }

  async getOptionMarketData(
    contractKeys: readonly OptionContractKey[],
  ): Promise<readonly OptionMarketData[]> {
    this.guard();
    const bucket = this.bucket();
    const underlyingCache = new Map<InstrumentKey, UnderlyingMarketData>();
    const out: OptionMarketData[] = [];
    for (const contractKey of contractKeys) {
      const parsed = parseOptionContractKey(contractKey);
      if (!parsed) continue;
      const underlyingKey: InstrumentKey = `${parsed.exchangeCode}:INDEX:${parsed.underlyingSymbol}`;
      const definition = catalogInstrument(underlyingKey);
      const config = MOCK_INSTRUMENTS[underlyingKey];
      if (!definition || !config || !definition.hasOptionChain) continue;
      let underlying = underlyingCache.get(underlyingKey);
      if (!underlying) {
        underlying = this.underlying(underlyingKey, definition, bucket);
        underlyingCache.set(underlyingKey, underlying);
      }
      out.push(
        this.optionQuote(contractKey, parsed.expiryDate, parsed.strike, parsed.optionType, {
          definition,
          baseIv: config.baseIv,
          underlying,
          bucket,
        }),
      );
    }
    return out;
  }

  private underlying(
    key: InstrumentKey,
    definition: InstrumentDefinition,
    bucket: number,
  ): UnderlyingMarketData {
    const decimals = definition.tickSize < 0.01 ? 4 : 2;
    const anchor = MOCK_INSTRUMENTS[key]?.anchor ?? (parseInstrumentKey(key) ? 14 : 1_000);
    const volatility = definition.kind === 'VOLATILITY_INDEX' ? 0.08 : 0.012;
    // Day-level seed keeps previous close / open stable across the session;
    // bucket-level seed moves the last level.
    const day = prng(hashSeed(`${key}|day|${istIsoDate(bucket)}`));
    const tick = prng(hashSeed(`${key}|bucket|${bucket}`));
    const previousClose = roundTo(anchor * (0.98 + day() * 0.04), decimals);
    const open = roundTo(previousClose * (1 + (day() - 0.5) * volatility * 0.5), decimals);
    const ltp = roundTo(previousClose * (1 + (tick() - 0.5) * volatility), decimals);
    const high = roundTo(Math.max(open, ltp) * (1 + tick() * volatility * 0.3), decimals);
    const low = roundTo(Math.min(open, ltp) * (1 - tick() * volatility * 0.3), decimals);
    const change = roundTo(ltp - previousClose, decimals);
    return {
      instrumentKey: key,
      ltp,
      previousClose,
      open,
      high,
      low,
      change,
      changePercent: roundTo((change / previousClose) * 100, 2),
      updatedAt: bucket,
      source: 'simulated',
    };
  }

  private optionQuote(
    contractKey: OptionContractKey,
    expiryDate: IsoDate,
    strike: number,
    optionType: OptionType,
    ctx: {
      definition: InstrumentDefinition;
      baseIv: number;
      underlying: UnderlyingMarketData;
      bucket: number;
    },
  ): OptionMarketData {
    const { definition, underlying, bucket } = ctx;
    const rand = prng(hashSeed(`${contractKey}|${bucket}`));
    const tickSize = definition.tickSize;
    const lotSize = definition.lotSize!;
    const step = definition.strikeStep!;
    const tYears = Math.max((istSessionCloseMs(expiryDate) - bucket) / YEAR_MS, MIN_T_YEARS);
    const logMoneyness = Math.log(strike / underlying.ltp);
    // Smile: quadratic in log-moneyness plus a mild put skew, jittered per bucket.
    const iv =
      ctx.baseIv + 2.2 * logMoneyness * logMoneyness - 0.25 * logMoneyness + (rand() - 0.5) * 0.004;
    const sigma = Math.min(Math.max(iv, 0.04), 1.5);

    const bs = blackScholes(
      { spot: underlying.ltp, strike, t: tYears, sigma, r: RISK_FREE_RATE },
      optionType,
    );
    const prev = blackScholes(
      {
        spot: underlying.previousClose,
        strike,
        t: tYears + 1 / 365,
        sigma,
        r: RISK_FREE_RATE,
      },
      optionType,
    );
    const ltp = Math.max(roundToTick(bs.price * (1 + (rand() - 0.5) * 0.01), tickSize), tickSize);
    const previousClose = Math.max(roundToTick(prev.price, tickSize), tickSize);
    const change = roundTo(ltp - previousClose, 2);
    const stepsFromAtm = Math.abs(strike - underlying.ltp) / step;
    const spread = Math.max(
      tickSize,
      roundToTick(ltp * (0.002 + (0.003 * Math.min(stepsFromAtm, 20)) / 20), tickSize),
    );
    const bid = Math.max(roundToTick(ltp - spread, tickSize), 0);
    const ask = roundToTick(ltp + spread, tickSize);
    const liquidity = Math.exp(-(stepsFromAtm * stepsFromAtm) / 60);
    const openInterest =
      Math.round((40_000 + 900_000 * liquidity) * (0.7 + rand() * 0.6)) * lotSize;
    const openInterestChange = Math.round(openInterest * (rand() - 0.45) * 0.08);
    const volume = Math.round(openInterest * (0.2 + rand() * 1.4) * liquidity);

    return {
      contractKey,
      ltp,
      previousClose,
      change,
      changePercent: previousClose > 0 ? roundTo((change / previousClose) * 100, 2) : null,
      volume,
      openInterest,
      openInterestChange,
      impliedVolatility: roundTo(sigma * 100, 2),
      bid,
      ask,
      bidQuantity: lotSize * (1 + Math.floor(rand() * 40)),
      askQuantity: lotSize * (1 + Math.floor(rand() * 40)),
      greeks: {
        delta: roundTo(bs.delta, 4),
        gamma: roundTo(bs.gamma, 6),
        theta: roundTo(bs.theta, 4),
        vega: roundTo(bs.vega, 4),
        rho: roundTo(bs.rho, 4),
      },
      updatedAt: bucket,
      source: 'simulated',
    };
  }
}

/* ------------------------------------------------------------------------ */
/* Calendar helpers on ISO dates (UTC arithmetic; dates carry no time).       */
/* ------------------------------------------------------------------------ */

function addDays(isoDate: IsoDate, days: number): IsoDate {
  const d = isoDateToUtcDate(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

/** ISO weekday 1..7 (Mon..Sun). */
function isoWeekday(isoDate: IsoDate): number {
  const js = isoDateToUtcDate(isoDate).getUTCDay();
  return js === 0 ? 7 : js;
}

/** First date ≥ `from` falling on `weekday`. */
function nextWeekday(from: IsoDate, weekday: number): IsoDate {
  const delta = (weekday - isoWeekday(from) + 7) % 7;
  return addDays(from, delta);
}

/** `YYYY-MM` → last date of that month falling on `weekday`. */
function lastWeekdayOfMonth(yearMonth: string, weekday: number): IsoDate {
  const [y, m] = yearMonth.split('-').map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(y, m, 0)); // day 0 of next month
  const last = toIsoDate(lastDay);
  const delta = (isoWeekday(last) - weekday + 7) % 7;
  return addDays(last, -delta);
}

function nextMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m, 1));
  return toIsoDate(d).slice(0, 7);
}

/** Plausible exchange-style symbol, e.g. `NIFTY50 16SEP26 24000 CE`. */
function tradingSymbol(
  symbol: string,
  expiryDate: IsoDate,
  strike: number,
  optionType: OptionType,
): string {
  const [y, m, d] = expiryDate.split('-') as [string, string, string];
  return `${symbol}${d}${MONTHS[Number(m) - 1]}${y.slice(2)}${strike}${optionType}`;
}
