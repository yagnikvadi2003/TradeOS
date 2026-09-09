import { Global, Module } from '@nestjs/common';
import { APP_ENV, type AppEnv } from '@/common/config/env';
import { MockMarketDataProvider } from './mock/mock-market-data.provider';
import { MARKET_DATA_PROVIDER, type MarketDataProvider } from './provider.interface';

/**
 * Composition root for the market-data provider port. The domain only ever
 * sees `MARKET_DATA_PROVIDER`; which adapter backs it is configuration.
 */
@Global()
@Module({
  providers: [
    {
      provide: MARKET_DATA_PROVIDER,
      inject: [APP_ENV],
      useFactory: (env: AppEnv): MarketDataProvider => {
        if (env.MARKET_DATA_PROVIDER === 'mock') return new MockMarketDataProvider();
        // The Upstox adapter (OAuth, REST, feed) is a later phase. Fail fast at
        // boot rather than silently serving simulated data under a real name.
        throw new Error(
          'MARKET_DATA_PROVIDER=upstox is not available yet; use mock in development',
        );
      },
    },
  ],
  exports: [MARKET_DATA_PROVIDER],
})
export class ProviderModule {}
