import { useMemo } from 'react';
import { type IndexQuote, type InstrumentKey } from '@/features/market/domain';
import { useLiveSubscription } from '@/hooks/use-live-subscription';
import { useLiveIndexTick } from '@/stores/market-state.store';
import { useIndexQuote } from './use-index-quotes';

/**
 * REST snapshot seeded, stream corrected: the query gives the first paint,
 * the live tick overrides it whenever it is newer. Retains the stream
 * subscription while mounted. Re-renders only when this key's tick changes.
 */
export function useLiveIndexQuote(key: InstrumentKey) {
  const query = useIndexQuote(key);
  useLiveSubscription([key]);
  const tick = useLiveIndexTick(key);
  const quote = useMemo<IndexQuote | null>(() => {
    const base = query.quote;
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
  }, [query.quote, tick]);
  return { ...query, quote };
}
