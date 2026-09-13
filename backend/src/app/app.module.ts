import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_ENV, type AppEnv } from '@/common/config/env';
import { ConfigModule } from '@/common/config/config.module';
import { GlobalHttpExceptionFilter } from '@/common/errors/http-exception.filter';
import { CacheModule } from '@/infrastructure/cache/cache.module';
import { DatabaseModule } from '@/infrastructure/database/database.module';
import { HealthController } from '@/infrastructure/health/health.controller';
import { MetricsController } from '@/infrastructure/health/metrics.controller';
import { HttpMetricsInterceptor } from '@/infrastructure/observability/http-metrics.interceptor';
import { LoggerModule } from '@/infrastructure/logging/logger.module';
import { RealtimeModule } from '@/infrastructure/realtime/realtime.module';
import { RedisModule } from '@/infrastructure/redis/redis.module';
import { AlertsModule } from '@/modules/alerts/alerts.module';
import { ChartsModule } from '@/modules/charts/charts.module';
import { MarketCalendarModule } from '@/modules/market-calendar/market-calendar.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { PreferencesModule } from '@/modules/preferences/preferences.module';
import { SessionModule } from '@/modules/session/session.module';
import { UserDataModule } from '@/modules/user-data/user-data.module';
import { WatchlistsModule } from '@/modules/watchlists/watchlists.module';
import { InstrumentsModule } from '@/modules/instruments/instruments.module';
import { MarketModule } from '@/modules/market/market.module';
import { MarketStreamModule } from '@/modules/market-stream/market-stream.module';
import { OptionChainModule } from '@/modules/option-chain/option-chain.module';
import { ProviderModule } from '@/providers/provider.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    DatabaseModule,
    CacheModule,
    RedisModule,
    RealtimeModule,
    ProviderModule,
    ThrottlerModule.forRootAsync({
      inject: [APP_ENV],
      useFactory: (env: AppEnv) => ({
        throttlers: [{ ttl: env.RATE_LIMIT_TTL_SECONDS * 1_000, limit: env.RATE_LIMIT_MAX }],
      }),
    }),
    OptionChainModule,
    MarketModule,
    InstrumentsModule,
    ChartsModule,
    MarketStreamModule,
    UserDataModule,
    SessionModule,
    WatchlistsModule,
    AlertsModule,
    NotificationsModule,
    PreferencesModule,
    MarketCalendarModule,
  ],
  controllers: [HealthController, MetricsController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: GlobalHttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
  ],
})
export class AppModule {}
