import { env } from '@/app/config/env';
import { HttpClient } from './http-client';
import { HttpMarketDataClient } from './http-market-data.client';
import { type MarketDataClient } from './market-data.client';
import { MockMarketDataClient } from './mock-market-data.client';

/**
 * Composition root for the market data port.
 *
 * The mock adapter is only ever constructed outside production. A production
 * build with `VITE_MARKET_DATA_SOURCE=mock` falls back to HTTP and the
 * backend contract — simulated data cannot ship to users.
 */
export function createMarketDataClient(): MarketDataClient {
  if (env.VITE_MARKET_DATA_SOURCE === 'mock' && !env.PROD) {
    return new MockMarketDataClient();
  }
  return new HttpMarketDataClient(new HttpClient({ baseUrl: env.VITE_API_BASE_URL }));
}

export { ApiError, HttpClient } from './http-client';
export { HttpMarketDataClient } from './http-market-data.client';
export type { MarketDataClient } from './market-data.client';
export { MockMarketDataClient } from './mock-market-data.client';
