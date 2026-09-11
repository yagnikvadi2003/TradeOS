import { type MarketUpdate, type OptionTick } from '@/services/websocket/market-stream.messages';
import { snapshotToRows, windowRows } from './rows';
import {
  type OptionChainRow,
  type OptionChainSnapshot,
  type OptionLeg,
  type UnderlyingMarketData,
} from './types';
import { type IndexTick } from '@/services/websocket/market-stream.messages';

/**
 * Overlay live option ticks onto snapshot rows. Pure and allocation-light:
 * a row (and each leg) keeps its reference unless a newer tick exists for
 * it, so AG Grid's transaction path sees exactly the rows that changed.
 * Ticks older than the value already shown never regress the row.
 */
export function mergeLegLive(leg: OptionLeg, tick: OptionTick): OptionLeg {
  const m = leg.market;
  if (tick.timestamp <= m.updatedAt) return leg;
  const ltp = tick.ltp ?? m.ltp;
  return {
    contract: leg.contract,
    market: {
      ltp,
      previousClose: tick.previousClose ?? m.previousClose,
      change: tick.change ?? m.change,
      changePercent: tick.changePercent ?? m.changePercent,
      volume: tick.volume ?? m.volume,
      openInterest: tick.openInterest ?? m.openInterest,
      openInterestChange: tick.openInterestChange ?? m.openInterestChange,
      impliedVolatility: tick.impliedVolatility ?? m.impliedVolatility,
      bid: tick.bid ?? m.bid,
      ask: tick.ask ?? m.ask,
      bidQuantity: tick.bidQuantity ?? m.bidQuantity,
      askQuantity: tick.askQuantity ?? m.askQuantity,
      greeks: tick.greeks ?? m.greeks,
      intrinsic: m.intrinsic,
      extrinsic: ltp === null ? null : Math.round((ltp - m.intrinsic) * 100) / 100,
      updatedAt: tick.timestamp,
    },
  };
}

export function mergeRowLive(
  row: OptionChainRow,
  updates: Readonly<Record<string, MarketUpdate>>,
): OptionChainRow {
  const ceTick = row.ce ? updates[row.ce.contract.contractKey] : undefined;
  const peTick = row.pe ? updates[row.pe.contract.contractKey] : undefined;
  const ce = row.ce && ceTick?.kind === 'option' ? mergeLegLive(row.ce, ceTick) : row.ce;
  const pe = row.pe && peTick?.kind === 'option' ? mergeLegLive(row.pe, peTick) : row.pe;
  if (ce === row.ce && pe === row.pe) return row;
  return { ...row, ce, pe };
}

/** Rows whose legs changed under the live overlay; identical rows are returned by reference. */
export function mergeRowsLive(
  rows: readonly OptionChainRow[],
  updates: Readonly<Record<string, MarketUpdate>>,
): { rows: OptionChainRow[]; changed: OptionChainRow[] } {
  const changed: OptionChainRow[] = [];
  const merged = rows.map((row) => {
    const next = mergeRowLive(row, updates);
    if (next !== row) changed.push(next);
    return next;
  });
  return { rows: merged, changed };
}

/** Stream keys a chain view needs: every visible contract. */
export function contractKeysOf(rows: readonly OptionChainRow[]): string[] {
  const keys: string[] = [];
  for (const row of rows) {
    if (row.ce) keys.push(row.ce.contract.contractKey);
    if (row.pe) keys.push(row.pe.contract.contractKey);
  }
  return keys;
}

/** Underlying header quote: the live tick wins when newer and complete. */
export function mergeUnderlyingLive(
  base: UnderlyingMarketData | null,
  tick: IndexTick | null,
): UnderlyingMarketData | null {
  if (tick?.ltp == null || tick.previousClose === null) return base;
  if (base !== null && tick.timestamp <= base.updatedAt) return base;
  const change = tick.change ?? Math.round((tick.ltp - tick.previousClose) * 100) / 100;
  return {
    instrumentKey: tick.instrumentKey,
    ltp: tick.ltp,
    previousClose: tick.previousClose,
    open: tick.open ?? base?.open ?? tick.ltp,
    high: tick.high ?? base?.high ?? tick.ltp,
    low: tick.low ?? base?.low ?? tick.ltp,
    change,
    changePercent: tick.changePercent ?? Math.round((change / tick.previousClose) * 10_000) / 100,
    updatedAt: tick.timestamp,
    source: tick.source,
  };
}

/** Stream keys for a chain view: the underlying plus every contract in the window. */
export function liveKeysFor(
  instrumentKey: string,
  snapshot: OptionChainSnapshot | null,
  strikeWindow: number | null,
): string[] {
  if (!snapshot) return [instrumentKey];
  return [instrumentKey, ...contractKeysOf(windowRows(snapshotToRows(snapshot), strikeWindow))];
}
