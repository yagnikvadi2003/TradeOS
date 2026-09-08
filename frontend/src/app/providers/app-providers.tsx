import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { createMarketDataClient, type MarketDataClient } from '@/services/api';
import { MarketDataProvider } from './market-data-provider';
import { createQueryClient } from './query-client';

interface AppProvidersProps {
  children: ReactNode;
  /** Test seam: inject a client instead of the environment-selected one. */
  marketDataClient?: MarketDataClient;
}

export function AppProviders({ children, marketDataClient }: AppProvidersProps) {
  const [queryClient] = useState(createQueryClient);
  const [client] = useState<MarketDataClient>(() => marketDataClient ?? createMarketDataClient());
  return (
    <QueryClientProvider client={queryClient}>
      <MarketDataProvider client={client}>{children}</MarketDataProvider>
    </QueryClientProvider>
  );
}
