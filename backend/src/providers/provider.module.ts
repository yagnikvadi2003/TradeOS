import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { APP_ENV, type AppEnv } from '@/common/config/env';
import { PRISMA } from '@/infrastructure/database/database.module';
import { type PrismaService } from '@/infrastructure/database/prisma.service';
import {
  MARKET_STATE_STORE,
  type MarketStateStore,
} from '@/infrastructure/realtime/market-state.store';
import { RealtimeMetrics } from '@/infrastructure/realtime/realtime-metrics';
import { MARKET_FEED_PROVIDER, type MarketFeedProvider } from './feed-provider.interface';
import { MockMarketDataProvider } from './mock/mock-market-data.provider';
import { MockMarketFeedProvider } from './mock/mock-market-feed.provider';
import { MARKET_DATA_PROVIDER, type MarketDataProvider } from './provider.interface';
import { CredentialCipher } from './upstox/auth/credential-cipher';
import {
  InMemoryCredentialStore,
  PrismaCredentialStore,
  PROVIDER_CREDENTIAL_STORE,
  type ProviderCredentialStore,
} from './upstox/auth/credential.store';
import { UpstoxAuthController } from './upstox/auth/upstox-auth.controller';
import { UpstoxAuthService } from './upstox/auth/upstox-auth.service';
import { UpstoxRestClient } from './upstox/rest/upstox-rest.client';
import { UpstoxMarketFeedProvider } from './upstox/websocket/upstox-feed.provider';
import { UpstoxFeedTransport } from './upstox/websocket/upstox-feed.transport';
import { UpstoxMarketDataProvider } from './upstox/upstox-market-data.provider';
import { UpstoxSymbolMap } from './upstox/mappers/upstox-symbol-map';
import { loadUpstoxEnv, UPSTOX_ENV, type UpstoxEnv } from './upstox/upstox.config';

/**
 * Composition root for both provider ports (snapshot + stream). The domain
 * only ever sees the tokens; which adapter backs them is configuration.
 * Upstox credentials live in this module and the credential store only.
 */
@Global()
@Module({
  controllers: [UpstoxAuthController],
  providers: [
    { provide: UPSTOX_ENV, useFactory: () => loadUpstoxEnv() },
    { provide: UpstoxSymbolMap, useFactory: () => new UpstoxSymbolMap() },
    {
      provide: PROVIDER_CREDENTIAL_STORE,
      inject: [APP_ENV, PRISMA, Logger],
      useFactory: (
        env: AppEnv,
        prisma: PrismaService | null,
        logger: Logger,
      ): ProviderCredentialStore => {
        if (prisma && env.CREDENTIAL_ENCRYPTION_KEY) {
          return new PrismaCredentialStore(
            prisma,
            new CredentialCipher(env.CREDENTIAL_ENCRYPTION_KEY),
          );
        }
        if (env.MARKET_DATA_PROVIDER === 'upstox') {
          logger.warn(
            'Provider credentials are held in memory only (no DATABASE_URL + CREDENTIAL_ENCRYPTION_KEY)',
          );
        }
        return new InMemoryCredentialStore();
      },
    },
    {
      provide: UpstoxAuthService,
      inject: [UPSTOX_ENV, PROVIDER_CREDENTIAL_STORE],
      useFactory: (upstox: UpstoxEnv, store: ProviderCredentialStore) =>
        new UpstoxAuthService(
          {
            apiBaseUrl: upstox.UPSTOX_API_BASE_URL,
            clientId: upstox.UPSTOX_CLIENT_ID,
            clientSecret: upstox.UPSTOX_CLIENT_SECRET,
            redirectUri: upstox.UPSTOX_REDIRECT_URI,
            staticAccessToken: upstox.UPSTOX_ACCESS_TOKEN,
          },
          store,
        ),
    },
    {
      provide: MARKET_DATA_PROVIDER,
      inject: [APP_ENV, UPSTOX_ENV, UpstoxAuthService, UpstoxSymbolMap, MARKET_STATE_STORE],
      useFactory: (
        env: AppEnv,
        upstox: UpstoxEnv,
        auth: UpstoxAuthService,
        symbols: UpstoxSymbolMap,
        state: MarketStateStore,
      ): MarketDataProvider => {
        if (env.MARKET_DATA_PROVIDER === 'mock') return new MockMarketDataProvider();
        const rest = new UpstoxRestClient(upstox.UPSTOX_API_BASE_URL, () => auth.getAccessToken());
        return new UpstoxMarketDataProvider(rest, symbols, state);
      },
    },
    {
      provide: MARKET_FEED_PROVIDER,
      inject: [
        APP_ENV,
        UPSTOX_ENV,
        UpstoxAuthService,
        UpstoxSymbolMap,
        RealtimeMetrics,
        Logger,
        MARKET_DATA_PROVIDER,
      ],
      useFactory: (
        env: AppEnv,
        upstox: UpstoxEnv,
        auth: UpstoxAuthService,
        symbols: UpstoxSymbolMap,
        metrics: RealtimeMetrics,
        logger: Logger,
        snapshotProvider: MarketDataProvider,
      ): MarketFeedProvider => {
        if (env.MARKET_DATA_PROVIDER === 'mock')
          return new MockMarketFeedProvider({ intervalMs: 1_000 });
        const transport = new UpstoxFeedTransport(upstox.UPSTOX_API_BASE_URL, () =>
          auth.getAccessToken(),
        );
        const feed = new UpstoxMarketFeedProvider({
          transport,
          symbols,
          mode: upstox.UPSTOX_FEED_MODE,
          maxSubscriptions: upstox.UPSTOX_MAX_SUBSCRIPTIONS,
          connectTimeoutMs: env.FEED_CONNECT_TIMEOUT_MS,
          staleAfterMs: env.FEED_STALE_AFTER_MS,
          metrics,
          logger: {
            info: (meta, msg) => logger.log(meta, msg),
            warn: (meta, msg) => logger.warn(meta, msg),
            error: (meta, msg) => logger.error(meta, msg),
          },
        });
        // Option contract keys can only be subscribed once the symbol map knows them;
        // the snapshot provider loads them on first option-chain access.
        void snapshotProvider;
        return feed;
      },
    },
  ],
  exports: [MARKET_DATA_PROVIDER, MARKET_FEED_PROVIDER, UpstoxAuthService, UpstoxSymbolMap],
})
export class ProviderModule implements OnModuleDestroy {
  constructor(@Inject(MARKET_FEED_PROVIDER) private readonly feed: MarketFeedProvider) {}
  async onModuleDestroy(): Promise<void> {
    await this.feed.stop();
  }
}
