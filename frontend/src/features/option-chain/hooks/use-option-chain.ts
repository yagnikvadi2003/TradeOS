import { useQuery } from '@tanstack/react-query';
import { useMarketDataClient } from '@/app/providers/use-market-data-client';
import { type InstrumentKey } from '@/features/market/domain';
import { type IsoDate } from '@/features/option-chain/domain';

export const optionChainQueryKeys = {
  all: ['option-chain'] as const,
  metadata: (key: InstrumentKey) => ['option-chain', key, 'metadata'] as const,
  snapshot: (key: InstrumentKey, expiry: IsoDate) =>
    ['option-chain', key, 'snapshot', expiry] as const,
};

/** Expiries, lot size and strike step. Changes rarely; cached for the session. */
export function useOptionChainMetadata(key: InstrumentKey, enabled = true) {
  const client = useMarketDataClient();
  return useQuery({
    queryKey: optionChainQueryKeys.metadata(key),
    queryFn: ({ signal }) => client.getOptionChainMetadata(key, signal),
    enabled,
    staleTime: 5 * 60_000,
  });
}

/**
 * REST snapshot of the chain for one expiry. No interval polling: the
 * realtime gateway will patch this cache with deltas in a later phase.
 * `refetch` is exposed for the explicit toolbar action only.
 */
export function useOptionChainSnapshot(key: InstrumentKey, expiry: IsoDate | null) {
  const client = useMarketDataClient();
  return useQuery({
    queryKey: optionChainQueryKeys.snapshot(key, expiry ?? ''),
    queryFn: ({ signal }) => client.getOptionChainSnapshot(key, expiry, signal),
    enabled: expiry !== null,
    staleTime: 2_000,
    refetchInterval: false,
    placeholderData: (previous) => (previous?.expiry.expiryDate === expiry ? previous : undefined),
  });
}
