import { useContext } from 'react';
import { type MarketDataClient } from '@/services/api';
import { MarketDataContext } from './market-data-context';

export function useMarketDataClient(): MarketDataClient {
  const client = useContext(MarketDataContext);
  if (!client) {
    throw new Error('useMarketDataClient must be used inside <MarketDataProvider>');
  }
  return client;
}
