import { type Candle } from './domain/candle';

/**
 * Technical indicators as pure functions over candle arrays. Output arrays
 * align with the input by index; positions without enough history are
 * `null` so charts can leave gaps instead of drawing warm-up artefacts.
 * All values are TradeOS-derived.
 */
export type Series = (number | null)[];

export function sma(values: readonly (number | null)[], period: number): Series {
  const out: Series = new Array<number | null>(values.length).fill(null);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v === null || v === undefined) {
      sum = 0;
      count = 0;
      continue;
    }
    sum += v;
    count += 1;
    if (count > period) {
      sum -= values[i - period]!;
      count = period;
    }
    if (count === period) out[i] = sum / period;
  }
  return out;
}

export function ema(values: readonly (number | null)[], period: number): Series {
  const out: Series = new Array<number | null>(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev: number | null = null;
  let seedSum = 0;
  let seedCount = 0;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v === null || v === undefined) continue;
    if (prev === null) {
      seedSum += v;
      seedCount += 1;
      if (seedCount === period) prev = seedSum / period;
      else continue;
    } else {
      prev = v * k + prev * (1 - k);
    }
    out[i] = prev;
  }
  return out;
}

export function rsi(candles: readonly Candle[], period = 14): Series {
  const out: Series = new Array<number | null>(candles.length).fill(null);
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < candles.length; i += 1) {
    const change = candles[i]!.close - candles[i - 1]!.close;
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    if (i <= period) {
      avgGain += gain / period;
      avgLoss += loss / period;
      if (i === period) out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
      continue;
    }
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function macd(
  candles: readonly Candle[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): { macd: Series; signal: Series; histogram: Series } {
  const closes = candles.map((c) => c.close);
  const fastE = ema(closes, fast);
  const slowE = ema(closes, slow);
  const line: Series = closes.map((_, i) =>
    fastE[i] !== null && slowE[i] !== null ? fastE[i]! - slowE[i]! : null,
  );
  const signal = ema(line, signalPeriod);
  const histogram: Series = line.map((v, i) =>
    v !== null && signal[i] !== null ? v - signal[i]! : null,
  );
  return { macd: line, signal, histogram };
}

export function bollinger(
  candles: readonly Candle[],
  period = 20,
  multiplier = 2,
): { middle: Series; upper: Series; lower: Series } {
  const closes = candles.map((c) => c.close);
  const middle = sma(closes, period);
  const upper: Series = new Array<number | null>(closes.length).fill(null);
  const lower: Series = new Array<number | null>(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i += 1) {
    const m = middle[i];
    if (m === null || m === undefined) continue;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j += 1) variance += (closes[j]! - m) ** 2;
    const sd = Math.sqrt(variance / period);
    upper[i] = m + multiplier * sd;
    lower[i] = m - multiplier * sd;
  }
  return { middle, upper, lower };
}

export function atr(candles: readonly Candle[], period = 14): Series {
  const tr: number[] = candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const prevClose = candles[i - 1]!.close;
    return Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
  });
  const out: Series = new Array<number | null>(candles.length).fill(null);
  let prev: number | null = null;
  for (let i = 0; i < tr.length; i += 1) {
    if (i < period - 1) continue;
    if (prev === null) {
      prev = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
    } else {
      prev = (prev * (period - 1) + tr[i]!) / period;
    }
    out[i] = prev;
  }
  return out;
}

/** Session VWAP; resets when the calendar day (IST) changes. Requires volume; null otherwise. */
export function vwap(candles: readonly Candle[]): Series {
  const out: Series = new Array<number | null>(candles.length).fill(null);
  let pv = 0;
  let vol = 0;
  let day = '';
  for (let i = 0; i < candles.length; i += 1) {
    const c = candles[i]!;
    if (c.volume === undefined || c.volume <= 0) continue;
    const d = new Date((c.time + 19_800) * 1000).toISOString().slice(0, 10);
    if (d !== day) {
      day = d;
      pv = 0;
      vol = 0;
    }
    pv += ((c.high + c.low + c.close) / 3) * c.volume;
    vol += c.volume;
    out[i] = pv / vol;
  }
  return out;
}

export const INDICATOR_IDS = ['sma20', 'ema50', 'bb20', 'rsi14', 'macd', 'atr14', 'vwap'] as const;
export type IndicatorId = (typeof INDICATOR_IDS)[number];
