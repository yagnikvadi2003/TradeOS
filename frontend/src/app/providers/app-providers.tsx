import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { createMarketDataClient, type MarketDataClient } from '@/services/api';
import { type MarketStream } from '@/services/websocket/market-stream';
import { MarketDataProvider } from './market-data-provider';
import { MarketStreamProvider } from './market-stream-provider';
import { createQueryClient } from './query-client';

interface AppProvidersProps {
  children: ReactNode;
  /** Test seam: inject a client instead of the environment-selected one. */
  marketDataClient?: MarketDataClient;
  /** Test seam: inject a stream (defaults to mock/ws based on the client). */
  marketStream?: MarketStream;
}

export function AppProviders({ children, marketDataClient, marketStream }: AppProvidersProps) {
  const [queryClient] = useState(createQueryClient);
  const [client] = useState<MarketDataClient>(() => marketDataClient ?? createMarketDataClient());
  return (
    <QueryClientProvider client={queryClient}>
      <MarketDataProvider client={client}>
        <MarketStreamProvider {...(marketStream ? { stream: marketStream } : {})}>
          {children}
        </MarketStreamProvider>
      </MarketDataProvider>
    </QueryClientProvider>
  );
}
