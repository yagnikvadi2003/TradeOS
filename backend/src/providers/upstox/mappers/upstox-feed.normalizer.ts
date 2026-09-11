import { type InstrumentKey } from '@/common/market/market-primitives';
import {
  type MarketSegmentStatus,
  type MarketStatusUpdate,
  type MarketUpdate,
} from '@/modules/market-stream/domain/market-update';
import { type UpstoxFeed, type UpstoxFeedResponse } from '../websocket/upstox-feed.codec';
import { type UpstoxSymbolMap } from './upstox-symbol-map';

export interface NormalizedFeed {
  readonly updates: MarketUpdate[];
  readonly statuses: MarketStatusUpdate[];
  /** Upstox keys in the message that the symbol map does not know. */
  readonly unknownKeys: string[];
}

const SEGMENT_STATUSES = new Set<MarketSegmentStatus>([
  'PRE_OPEN_START',
  'PRE_OPEN_END',
  'NORMAL_OPEN',
  'NORMAL_CLOSE',
  'CLOSING_START',
  'CLOSING_END',
]);

function round(value: number | undefined, decimals = 2): number | null {
  if (value === undefined || !Number.isFinite(value)) return null;
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

function nonNegative(value: number | undefined): number | null {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Upstox V3 `FeedResponse` → TradeOS updates. Field semantics (from the
 * feed docs): `ltpc.cp` is the previous close, `ltt` last-trade time (ms),
 * `iv` a fraction (0.13 → 13 %), `vtt` volume today, `oi` open interest,
 * `marketOHLC.ohlc[interval='1d']` today's OHLC. Anything absent stays null.
 * OI change is not carried by the feed; it is null here and enriched
 * downstream when a session-open OI reference is known.
 */
export class UpstoxFeedNormalizer {
  constructor(private readonly symbols: UpstoxSymbolMap) {}

  normalize(response: UpstoxFeedResponse, receivedAt: number): NormalizedFeed {
    const updates: MarketUpdate[] = [];
    const statuses: MarketStatusUpdate[] = [];
    const unknownKeys: string[] = [];
    const fallbackTs = response.currentTs ?? receivedAt;

    if (response.marketInfo?.segmentStatus) {
      for (const [segment, raw] of Object.entries(response.marketInfo.segmentStatus)) {
        const status: MarketSegmentStatus = SEGMENT_STATUSES.has(raw as MarketSegmentStatus)
          ? (raw as MarketSegmentStatus)
          : 'UNKNOWN';
        const exchangeCode = segment.startsWith('NSE')
          ? 'NSE'
          : segment.startsWith('BSE')
            ? 'BSE'
            : null;
        if (!exchangeCode) continue;
        const kind = segment.endsWith('_FO') ? 'FO' : segment.endsWith('_INDEX') ? 'INDEX' : null;
        if (!kind) continue;
        statuses.push({ exchangeCode, segment: kind, status, timestamp: fallbackTs });
      }
    }

    for (const [upstoxKey, feed] of Object.entries(response.feeds ?? {})) {
      const tradeOsKey = this.symbols.tradeOsKeyFor(upstoxKey);
      if (!tradeOsKey) {
        unknownKeys.push(upstoxKey);
        continue;
      }
      const update = tradeOsKey.includes(':OPT:')
        ? this.option(tradeOsKey, feed, fallbackTs, receivedAt)
        : this.index(tradeOsKey as InstrumentKey, feed, fallbackTs, receivedAt);
      if (update) updates.push(update);
    }
    return { updates, statuses, unknownKeys };
  }

  private index(
    instrumentKey: InstrumentKey,
    feed: UpstoxFeed,
    fallbackTs: number,
    receivedAt: number,
  ): MarketUpdate | null {
    const ltpc = feed.fullFeed?.indexFF?.ltpc ?? feed.fullFeed?.marketFF?.ltpc ?? feed.ltpc;
    const ohlc =
      feed.fullFeed?.indexFF?.marketOHLC?.ohlc ?? feed.fullFeed?.marketFF?.marketOHLC?.ohlc;
    if (!ltpc) return null;
    const day = ohlc?.find((o) => o.interval === '1d');
    const ltp = ltpc.ltp !== undefined && ltpc.ltp > 0 ? ltpc.ltp : null;
    const previousClose = ltpc.cp !== undefined && ltpc.cp > 0 ? ltpc.cp : null;
    const change = ltp !== null && previousClose !== null ? round(ltp - previousClose) : null;
    return {
      kind: 'index',
      instrumentKey,
      timestamp: ltpc.ltt && ltpc.ltt > 0 ? ltpc.ltt : fallbackTs,
      receivedAt,
      ltp,
      previousClose,
      open: nonNegative(day?.open),
      high: nonNegative(day?.high),
      low: nonNegative(day?.low),
      change,
      changePercent:
        change !== null && previousClose ? round((change / previousClose) * 100) : null,
      volume: null,
      source: 'live',
    };
  }

  private option(
    contractKey: string,
    feed: UpstoxFeed,
    fallbackTs: number,
    receivedAt: number,
  ): MarketUpdate | null {
    const mapped = this.symbols.option(contractKey as never);
    if (!mapped) return null;
    const full = feed.fullFeed?.marketFF;
    const first = feed.firstLevelWithGreeks;
    const ltpc = full?.ltpc ?? first?.ltpc ?? feed.ltpc;
    if (!ltpc) return null;
    const depth = full?.marketLevel?.bidAskQuote?.[0] ?? first?.firstDepth;
    const greeks = full?.optionGreeks ?? first?.optionGreeks;
    const ltp = nonNegative(ltpc.ltp);
    const previousClose = ltpc.cp !== undefined && ltpc.cp > 0 ? ltpc.cp : null;
    const change = ltp !== null && previousClose !== null ? round(ltp - previousClose) : null;
    const ivFraction = full?.iv ?? first?.iv;
    const { contract } = mapped;
    return {
      kind: 'option',
      contractKey: contract.contractKey,
      underlyingKey: contract.underlyingKey,
      exchangeCode: contract.exchangeCode,
      expiryDate: contract.expiryDate,
      strike: contract.strike,
      optionType: contract.optionType,
      timestamp: ltpc.ltt && ltpc.ltt > 0 ? ltpc.ltt : fallbackTs,
      receivedAt,
      ltp,
      previousClose,
      change,
      changePercent:
        change !== null && previousClose ? round((change / previousClose) * 100) : null,
      volume: nonNegative(full?.vtt ?? first?.vtt),
      openInterest: nonNegative(full?.oi ?? first?.oi),
      openInterestChange: null,
      impliedVolatility:
        ivFraction !== undefined && ivFraction >= 0 ? round(ivFraction * 100) : null,
      bid: nonNegative(depth?.bidP),
      ask: nonNegative(depth?.askP),
      bidQuantity: nonNegative(depth?.bidQ),
      askQuantity: nonNegative(depth?.askQ),
      greeks:
        greeks?.delta !== undefined
          ? {
              delta: Math.max(-1, Math.min(1, greeks.delta)),
              gamma: greeks.gamma ?? 0,
              theta: greeks.theta ?? 0,
              vega: greeks.vega ?? 0,
              ...(greeks.rho !== undefined ? { rho: greeks.rho } : {}),
            }
          : null,
      source: 'live',
    };
  }
}
