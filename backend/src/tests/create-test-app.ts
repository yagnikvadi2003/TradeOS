import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '@/app/app.module';
import { configureApp } from '@/app/configure-app';
import { APP_ENV, type AppEnv } from '@/common/config/env';
import { MockMarketDataProvider } from '@/providers/mock/mock-market-data.provider';
import { MARKET_DATA_PROVIDER, type MarketDataProvider } from '@/providers/provider.interface';
import { CLOCK } from '@/modules/option-chain/option-chain.service';
import { FIXED_NOW, testEnv } from './fakes';

export interface TestAppOptions {
  readonly env?: Partial<AppEnv>;
  readonly provider?: MarketDataProvider;
  readonly now?: () => number;
}

/**
 * Boots the real application module with the in-memory repository and a
 * deterministic mock provider. No database, no network.
 */
export async function createTestApp(options: TestAppOptions = {}): Promise<INestApplication> {
  const now = options.now ?? (() => FIXED_NOW);
  const env = testEnv({ LOG_LEVEL: 'silent', SWAGGER_ENABLED: false, ...options.env });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(APP_ENV)
    .useValue(env)
    .overrideProvider(MARKET_DATA_PROVIDER)
    .useValue(options.provider ?? new MockMarketDataProvider({ now, strikesEachSide: 10 }))
    .overrideProvider(CLOCK)
    .useValue(now)
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  return app;
}
