import { useQuery } from '@tanstack/react-query';
import { useMarketDataClient } from '@/app/providers/use-market-data-client';
import { type CandleInterval } from '@/features/charts/domain';
import { type InstrumentKey } from '@/features/market/domain';

export const candleQueryKeys = {
  series: (key: InstrumentKey, interval: CandleInterval) =>
    ['charts', 'candles', key, interval] as const,
};

export function useCandles(key: InstrumentKey, interval: CandleInterval) {
  const client = useMarketDataClient();
  return useQuery({
    queryKey: candleQueryKeys.series(key, interval),
    queryFn: ({ signal }) => client.getCandles(key, interval, signal),
    staleTime: 60_000,
  });
}
