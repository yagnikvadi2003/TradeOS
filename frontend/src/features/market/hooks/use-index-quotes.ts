import { useQuery } from '@tanstack/react-query';
import { useMarketDataClient } from '@/app/providers/use-market-data-client';
import { type IndexQuote, type InstrumentKey } from '@/features/market/domain';

export const quoteQueryKeys = {
  all: ['market', 'quotes'] as const,
  forKeys: (keys: readonly InstrumentKey[]) => ['market', 'quotes', [...keys].sort()] as const,
};

/**
 * REST snapshot of index quotes. No polling: realtime deltas will patch the
 * query cache from the WebSocket client in a later phase.
 */
export function useIndexQuotes(keys: readonly InstrumentKey[]) {
  const client = useMarketDataClient();
  return useQuery({
    queryKey: quoteQueryKeys.forKeys(keys),
    queryFn: ({ signal }) => client.getIndexQuotes(keys, signal),
    enabled: keys.length > 0,
    select: (quotes): ReadonlyMap<InstrumentKey, IndexQuote> =>
      new Map(quotes.map((quote) => [quote.instrumentKey, quote])),
  });
}

export function useIndexQuote(key: InstrumentKey) {
  const query = useIndexQuotes([key]);
  return { ...query, quote: query.data?.get(key) ?? null };
}
