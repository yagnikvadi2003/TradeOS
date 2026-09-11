import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '@/app/app.module';
import { configureApp } from '@/app/configure-app';
import { APP_ENV, type AppEnv } from '@/common/config/env';
import { MARKET_FEED_PROVIDER } from '@/providers/feed-provider.interface';
import { MockMarketDataProvider } from '@/providers/mock/mock-market-data.provider';
import { MockMarketFeedProvider } from '@/providers/mock/mock-market-feed.provider';
import { MARKET_DATA_PROVIDER, type MarketDataProvider } from '@/providers/provider.interface';
import { CLOCK } from '@/modules/option-chain/option-chain.service';
import { FIXED_NOW, testEnv } from './fakes';

export interface TestAppOptions {
  readonly env?: Partial<AppEnv>;
  readonly provider?: MarketDataProvider;
  readonly now?: () => number;
  /** Manual mock feed: ticks only when tests call `feed.tick()`. */
  readonly feed?: MockMarketFeedProvider;
}

/**
 * Boots the real application module with the in-memory repository and a
 * deterministic mock provider. No database, no network.
 */
export async function createTestApp(opts: TestAppOptions = {}): Promise<INestApplication> {
  const now = opts.now ?? (() => FIXED_NOW);
  const env = testEnv({ LOG_LEVEL: 'silent', SWAGGER_ENABLED: false, ...opts.env });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(APP_ENV)
    .useValue(env)
    .overrideProvider(MARKET_DATA_PROVIDER)
    .useValue(opts.provider ?? new MockMarketDataProvider({ now, strikesEachSide: 10 }))
    .overrideProvider(MARKET_FEED_PROVIDER)
    .useValue(opts.feed ?? new MockMarketFeedProvider({ manual: true, now }))
    .overrideProvider(CLOCK)
    .useValue(now)
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  return app;
}
