import { marketCatalog } from '@/features/market/config';
import { type InstrumentKey } from '@/features/market/domain';
import {
  type Expiry,
  type ExpiryCycle,
  type IsoDate,
  type OptionChainSnapshot,
  type OptionContract,
  type OptionLeg,
  type OptionMarketData,
  type OptionStrike,
  type OptionType,
  type UnderlyingMarketData,
} from '@/features/option-chain/domain';

/**
 * Deterministic option-chain simulation for development and tests ONLY —
 * the frontend twin of the backend mock adapter. Same rules: pure function
 * of (instrument, expiry, time bucket), Black–Scholes-consistent values,
 * everything tagged `simulated`. Never a market feed.
 */

interface SimConfig {
  readonly anchor: number;
  readonly baseIv: number;
  readonly weekday: number;
  readonly weeklyCount: number;
  readonly monthlyCount: number;
  readonly step: number;
  readonly lotSize: number;
}

export const SIM_CONFIG: Readonly<Record<string, SimConfig>> = {
  'NSE:INDEX:NIFTY50': {
    anchor: 24_000,
    baseIv: 0.13,
    weekday: 2,
    weeklyCount: 4,
    monthlyCount: 3,
    step: 50,
    lotSize: 75,
  },
  'NSE:INDEX:BANKNIFTY': {
    anchor: 52_000,
    baseIv: 0.16,
    weekday: 2,
    weeklyCount: 0,
    monthlyCount: 3,
    step: 100,
    lotSize: 35,
  },
  'NSE:INDEX:FINNIFTY': {
    anchor: 24_500,
    baseIv: 0.15,
    weekday: 2,
    weeklyCount: 0,
    monthlyCount: 3,
    step: 50,
    lotSize: 65,
  },
  'BSE:INDEX:SENSEX': {
    anchor: 79_000,
    baseIv: 0.13,
    weekday: 4,
    weeklyCount: 4,
    monthlyCount: 3,
    step: 100,
    lotSize: 20,
  },
  'BSE:INDEX:BANKEX': {
    anchor: 58_000,
    baseIv: 0.16,
    weekday: 4,
    weeklyCount: 0,
    monthlyCount: 3,
    step: 100,
    lotSize: 30,
  },
};

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const RATE = 0.065;

export function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function prng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
const toTick = (v: number, tick: number) => round(Math.round(v / tick) * tick, 4);

function istDate(ms: number): IsoDate {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}
function utc(date: IsoDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}
function addDays(date: IsoDate, days: number): IsoDate {
  const d = utc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function isoWeekday(date: IsoDate): number {
  const js = utc(date).getUTCDay();
  return js === 0 ? 7 : js;
}
function closeMs(date: IsoDate): number {
  return Date.parse(`${date}T15:30:00.000+05:30`);
}

function normalCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.2316419 * ax);
  const poly =
    t *
    (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const pdf = Math.exp(-0.5 * ax * ax) / Math.sqrt(2 * Math.PI);
  return 0.5 + sign * (0.5 - pdf * poly);
}

function price(spot: number, strike: number, t: number, sigma: number, type: OptionType) {
  const sqrtT = Math.sqrt(t);
  const d1 = (Math.log(spot / strike) + (RATE + 0.5 * sigma * sigma) * t) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const disc = Math.exp(-RATE * t);
  const nd1 = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);
  const gamma = nd1 / (spot * sigma * sqrtT);
  const vega = (spot * nd1 * sqrtT) / 100;
  if (type === 'CE') {
    return {
      value: spot * normalCdf(d1) - strike * disc * normalCdf(d2),
      delta: normalCdf(d1),
      gamma,
      theta: (-(spot * nd1 * sigma) / (2 * sqrtT) - RATE * strike * disc * normalCdf(d2)) / 365,
      vega,
    };
  }
  return {
    value: strike * disc * normalCdf(-d2) - spot * normalCdf(-d1),
    delta: normalCdf(d1) - 1,
    gamma,
    theta: (-(spot * nd1 * sigma) / (2 * sqrtT) + RATE * strike * disc * normalCdf(-d2)) / 365,
    vega,
  };
}

export function simulateExpiries(key: InstrumentKey, nowMs: number): Expiry[] {
  const config = SIM_CONFIG[key];
  if (!config) return [];
  const today = istDate(nowMs);
  const first = nowMs < closeMs(today) ? today : addDays(today, 1);
  const dates = new Map<IsoDate, ExpiryCycle>();
  let cursor = addDays(first, (config.weekday - isoWeekday(first) + 7) % 7);
  for (let i = 0; i < config.weeklyCount; i += 1) {
    dates.set(cursor, 'WEEKLY');
    cursor = addDays(cursor, 7);
  }
  let [y, m] = first.split('-').map(Number) as [number, number];
  let added = 0;
  while (added < config.monthlyCount) {
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const monthly = addDays(last, -((isoWeekday(last) - config.weekday + 7) % 7));
    if (monthly >= first) {
      dates.set(monthly, 'MONTHLY');
      added += 1;
    }
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return [...dates.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([expiryDate, cycle]) => ({
      instrumentKey: key,
      expiryDate,
      cycle,
      daysToExpiry: Math.round((utc(expiryDate).getTime() - utc(today).getTime()) / 86_400_000),
    }));
}

export function simulateUnderlying(key: InstrumentKey, bucket: number): UnderlyingMarketData {
  const instrument = marketCatalog.instrumentByKey(key);
  const decimals = instrument.tickSize < 0.01 ? 4 : 2;
  const anchor = SIM_CONFIG[key]?.anchor ?? 14;
  const volatility = instrument.kind === 'VOLATILITY_INDEX' ? 0.08 : 0.012;
  const day = prng(hashSeed(`${key}|day|${istDate(bucket)}`));
  const tick = prng(hashSeed(`${key}|bucket|${bucket}`));
  const previousClose = round(anchor * (0.98 + day() * 0.04), decimals);
  const open = round(previousClose * (1 + (day() - 0.5) * volatility * 0.5), decimals);
  const ltp = round(previousClose * (1 + (tick() - 0.5) * volatility), decimals);
  const high = round(Math.max(open, ltp) * (1 + tick() * volatility * 0.3), decimals);
  const low = round(Math.min(open, ltp) * (1 - tick() * volatility * 0.3), decimals);
  const change = round(ltp - previousClose, decimals);
  return {
    instrumentKey: key,
    ltp,
    previousClose,
    open,
    high,
    low,
    change,
    changePercent: round((change / previousClose) * 100, 2),
    updatedAt: bucket,
    source: 'simulated',
  };
}

function leg(
  key: InstrumentKey,
  expiry: IsoDate,
  strike: number,
  type: OptionType,
  underlying: UnderlyingMarketData,
  bucket: number,
  config: SimConfig,
  tickSize: number,
): OptionLeg {
  const exchange = key.startsWith('NSE') ? 'NSE' : 'BSE';
  const symbol = key.split(':')[2] ?? '';
  const contractKey = `${exchange}:OPT:${symbol}:${expiry}:${strike}:${type}`;
  const rand = prng(hashSeed(`${contractKey}|${bucket}`));
  const t = Math.max((closeMs(expiry) - bucket) / YEAR_MS, 1 / (365 * 24));
  const lm = Math.log(strike / underlying.ltp);
  const sigma = Math.min(
    Math.max(config.baseIv + 2.2 * lm * lm - 0.25 * lm + (rand() - 0.5) * 0.004, 0.04),
    1.5,
  );
  const bs = price(underlying.ltp, strike, t, sigma, type);
  const prev = price(underlying.previousClose, strike, t + 1 / 365, sigma, type);
  const ltp = Math.max(toTick(bs.value * (1 + (rand() - 0.5) * 0.01), tickSize), tickSize);
  const previousClose = Math.max(toTick(prev.value, tickSize), tickSize);
  const change = round(ltp - previousClose, 2);
  const steps = Math.abs(strike - underlying.ltp) / config.step;
  const spread = Math.max(
    tickSize,
    toTick(ltp * (0.002 + (0.003 * Math.min(steps, 20)) / 20), tickSize),
  );
  const liquidity = Math.exp(-(steps * steps) / 60);
  const openInterest =
    Math.round((40_000 + 900_000 * liquidity) * (0.7 + rand() * 0.6)) * config.lotSize;
  const intrinsic = Math.max(
    0,
    round(type === 'CE' ? underlying.ltp - strike : strike - underlying.ltp, 2),
  );
  const contract: OptionContract = {
    contractKey,
    underlyingKey: key,
    exchangeCode: exchange,
    tradingSymbol: `${symbol}${expiry.replace(/-/g, '')}${strike}${type}`,
    expiryDate: expiry,
    strike,
    optionType: type,
    lotSize: config.lotSize,
    tickSize,
  };
  const market: OptionMarketData = {
    ltp,
    previousClose,
    change,
    changePercent: round((change / previousClose) * 100, 2),
    volume: Math.round(openInterest * (0.2 + rand() * 1.4) * liquidity),
    openInterest,
    openInterestChange: Math.round(openInterest * (rand() - 0.45) * 0.08),
    impliedVolatility: round(sigma * 100, 2),
    bid: Math.max(toTick(ltp - spread, tickSize), 0),
    ask: toTick(ltp + spread, tickSize),
    bidQuantity: config.lotSize * (1 + Math.floor(rand() * 40)),
    askQuantity: config.lotSize * (1 + Math.floor(rand() * 40)),
    greeks: {
      delta: round(bs.delta, 4),
      gamma: round(bs.gamma, 6),
      theta: round(bs.theta, 4),
      vega: round(bs.vega, 4),
    },
    intrinsic,
    extrinsic: round(ltp - intrinsic, 2),
    updatedAt: bucket,
  };
  return { contract, market };
}

/** One simulated option leg for a contract key, or null when the key is not simulated. */
export function simulateOptionLeg(contractKey: string, bucket: number): OptionLeg | null {
  const parts = contractKey.split(':');
  if (parts.length !== 6 || parts[1] !== 'OPT') return null;
  const [exchange, , symbol, expiry, strikeText, type] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const key = `${exchange}:INDEX:${symbol}` as InstrumentKey;
  const config = SIM_CONFIG[key];
  const strike = Number(strikeText);
  if (!config || !Number.isFinite(strike) || (type !== 'CE' && type !== 'PE')) return null;
  const tickSize = marketCatalog.instrumentByKey(key).tickSize;
  return leg(key, expiry, strike, type, simulateUnderlying(key, bucket), bucket, config, tickSize);
}

export function simulateSnapshot(
  key: InstrumentKey,
  expiry: Expiry,
  bucket: number,
  strikesEachSide = 40,
): OptionChainSnapshot {
  const config = SIM_CONFIG[key];
  if (!config) throw new Error(`No simulated option chain for ${key}`);
  const tickSize = marketCatalog.instrumentByKey(key).tickSize;
  const underlying = simulateUnderlying(key, bucket);
  const centre = Math.round(config.anchor / config.step) * config.step;
  const strikeLevels: number[] = [];
  for (let i = -strikesEachSide; i <= strikesEachSide; i += 1)
    strikeLevels.push(centre + i * config.step);
  let atm = strikeLevels[0] ?? centre;
  for (const s of strikeLevels)
    if (Math.abs(s - underlying.ltp) < Math.abs(atm - underlying.ltp)) atm = s;

  const totals = { ceOpenInterest: 0, peOpenInterest: 0, ceVolume: 0, peVolume: 0 };
  const strikes: OptionStrike[] = strikeLevels.map((strike) => {
    const ce = leg(key, expiry.expiryDate, strike, 'CE', underlying, bucket, config, tickSize);
    const pe = leg(key, expiry.expiryDate, strike, 'PE', underlying, bucket, config, tickSize);
    totals.ceOpenInterest += ce.market.openInterest ?? 0;
    totals.peOpenInterest += pe.market.openInterest ?? 0;
    totals.ceVolume += ce.market.volume ?? 0;
    totals.peVolume += pe.market.volume ?? 0;
    return {
      strike,
      isAtm: strike === atm,
      stepsFromAtm: Math.round((strike - atm) / config.step),
      ce,
      pe,
    };
  });
  return {
    instrumentKey: key,
    expiry,
    underlying,
    atmStrike: atm,
    strikeStep: config.step,
    lotSize: config.lotSize,
    strikes,
    totals: {
      ...totals,
      putCallRatio:
        totals.ceOpenInterest > 0 ? round(totals.peOpenInterest / totals.ceOpenInterest, 3) : null,
    },
    asOf: bucket,
    oldestUpdateAt: bucket,
    source: 'simulated',
  };
}
