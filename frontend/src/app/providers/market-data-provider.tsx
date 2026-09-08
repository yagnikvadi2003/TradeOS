import { type ReactNode } from 'react';
import { type MarketDataClient } from '@/services/api';
import { MarketDataContext } from './market-data-context';

export function MarketDataProvider({
  client,
  children,
}: {
  client: MarketDataClient;
  children: ReactNode;
}) {
  return <MarketDataContext.Provider value={client}>{children}</MarketDataContext.Provider>;
}
